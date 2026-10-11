import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import type { Socket } from 'net';

export interface ProcEndpoints {
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
}

/**
 * Loopback TCP does not hide the dashboard from other accounts on this machine.
 * Accept a socket only when the kernel says the peer process has our uid.
 * Linux reads that uid from `/proc/net/tcp`. Elsewhere we ask `lsof`.
 * If the peer uid cannot be shown, the connection is rejected.
 */
export function sameUserAsPeer(socket: ProcEndpoints): boolean {
  const mine = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (mine === undefined) return false;
  return lookupPeerUid(socket) === mine;
}

export function peerRejection(socket: ProcEndpoints): string | null {
  return sameUserAsPeer(socket) ? null : 'Peer user not allowed';
}

export function formatProcAddress(address: string, port: number): string | null {
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
  const portHex = port.toString(16).toUpperCase().padStart(4, '0');
  const ip = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  const host = ip.includes('.') ? ipv4Proc(ip) : ipv6Proc(ip);
  if (!host) return null;
  return `${host}:${portHex}`;
}

/** Uid of the peer socket (the row whose addresses are the reverse of ours). */
export function peerUidFromProcNet(table: string, endpoints: ProcEndpoints): number | null {
  if (!endpoints.localAddress || !endpoints.remoteAddress) return null;
  if (endpoints.localPort === undefined || endpoints.remotePort === undefined) return null;
  const local = formatProcAddress(endpoints.localAddress, endpoints.localPort);
  const remote = formatProcAddress(endpoints.remoteAddress, endpoints.remotePort);
  if (!local || !remote) return null;

  let found: number | null = null;
  for (const line of table.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8 || parts[3] !== '01') continue;
    if (parts[1].toUpperCase() !== remote || parts[2].toUpperCase() !== local) continue;
    const uid = Number(parts[7]);
    if (!Number.isInteger(uid)) return null;
    if (found !== null && found !== uid) return null;
    found = uid;
  }
  return found;
}

/** `lsof -F` output. Matches `remote -> local` and returns that process uid. */
export function peerUidFromLsof(output: string, endpoints: ProcEndpoints): number | null {
  if (!endpoints.localAddress || !endpoints.remoteAddress) return null;
  if (endpoints.localPort === undefined || endpoints.remotePort === undefined) return null;
  const want = `${endpoints.remoteAddress}:${endpoints.remotePort}->${endpoints.localAddress}:${endpoints.localPort}`;
  let uid: number | null = null;
  let currentUid: number | null = null;
  let matched = false;
  let conflict = false;

  const take = () => {
    if (!matched || currentUid === null || conflict) return;
    if (uid !== null && uid !== currentUid) {
      uid = null;
      conflict = true;
      return;
    }
    uid = currentUid;
  };

  for (const line of output.split('\n')) {
    if (line.startsWith('p')) {
      take();
      matched = false;
      currentUid = null;
    } else if (line.startsWith('u')) {
      const parsed = Number(line.slice(1));
      currentUid = Number.isInteger(parsed) ? parsed : null;
    } else if (line.startsWith('n') && line.slice(1) === want) {
      matched = true;
    }
  }
  take();
  return conflict ? null : uid;
}

function lookupPeerUid(socket: ProcEndpoints): number | null {
  const tables = readProcTables();
  if (tables !== null) return peerUidFromProcNet(tables, socket);
  const listed = readLsof();
  if (listed === null) return null;
  return peerUidFromLsof(listed, socket);
}

function readProcTables(): string | null {
  if (!existsSync('/proc/net/tcp')) return null;
  let text = readFileSync('/proc/net/tcp', 'utf8');
  if (existsSync('/proc/net/tcp6')) text += `\n${readFileSync('/proc/net/tcp6', 'utf8')}`;
  return text;
}

function readLsof(): string | null {
  const result = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED', '-F', 'pun'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout;
}

function ipv4Proc(ip: string): string | null {
  const parts = ip.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  const value = ((parts[0] | (parts[1] << 8) | (parts[2] << 16) | (parts[3] << 24)) >>> 0)
    .toString(16)
    .toUpperCase()
    .padStart(8, '0');
  return value;
}

function ipv6Proc(address: string): string | null {
  const groups = expandIpv6(address);
  if (!groups) return null;
  let hex = '';
  for (let word = 0; word < 4; word++) {
    const value = (groups[word * 2] << 16) | groups[word * 2 + 1];
    const little =
      ((value & 0xff) << 24) |
      ((value & 0xff00) << 8) |
      ((value >> 8) & 0xff00) |
      ((value >> 24) & 0xff);
    hex += (little >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }
  return hex;
}

function expandIpv6(address: string): number[] | null {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const values: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      values.push(parseInt(group, 16));
    }
    return values;
  };
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

/** Express and Vite both call this before a response is written. */
export function rejectForeignPeer(
  socket: Socket,
  reject: (status: number, body: string) => void,
): boolean {
  const error = peerRejection(socket);
  if (!error) return false;
  reject(403, JSON.stringify({ ok: false, error }));
  return true;
}
