import { connect, createServer } from 'net';
import { describe, expect, it } from 'vitest';
import {
  formatProcAddress,
  peerUidFromLsof,
  peerUidFromProcNet,
  sameUserAsPeer,
} from '../peerUser';

describe('peer uid', () => {
  it('encodes 127.0.0.1 and ::1 the way /proc/net/tcp does', () => {
    expect(formatProcAddress('127.0.0.1', 45127)).toBe('0100007F:B047');
    expect(formatProcAddress('::ffff:127.0.0.1', 80)).toBe('0100007F:0050');
    expect(formatProcAddress('::1', 1)).toBe('00000000000000000000000001000000:0001');
  });

  it('reads the uid from the reversed connection row', () => {
    const table = [
      'sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
      '6: 0100007F:B047 0100007F:9F18 01 00000000:00000000 00:00000000 00000000  1000        0 1 1 0 20 0 0 10 -1',
      '9: 0100007F:9F18 0100007F:B047 01 00000000:00000000 00:00000000 00000000  65534        0 2 1 0 20 0 0 10 -1',
    ].join('\n');
    expect(
      peerUidFromProcNet(table, {
        localAddress: '127.0.0.1',
        localPort: 45127,
        remoteAddress: '127.0.0.1',
        remotePort: 40728,
      }),
    ).toBe(65534);
  });

  it('rejects a table that names two different uids for one connection', () => {
    const row = (uid: number) =>
      `9: 0100007F:9F18 0100007F:B047 01 00000000:00000000 00:00000000 00000000  ${uid}        0 2 1 0 20 0 0 10 -1`;
    expect(
      peerUidFromProcNet(`${row(1000)}\n${row(65534)}`, {
        localAddress: '127.0.0.1',
        localPort: 45127,
        remoteAddress: '127.0.0.1',
        remotePort: 40728,
      }),
    ).toBeNull();
  });

  it('reads a uid from lsof field output', () => {
    const output = [
      'p10',
      'u1000',
      'n127.0.0.1:40728->127.0.0.1:45127',
      'p11',
      'u65534',
      'n10.0.0.1:1->10.0.0.2:2',
    ].join('\n');
    expect(
      peerUidFromLsof(output, {
        localAddress: '127.0.0.1',
        localPort: 45127,
        remoteAddress: '127.0.0.1',
        remotePort: 40728,
      }),
    ).toBe(1000);
  });

  it('accepts this process on a live loopback connection', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const client = connect(port, '127.0.0.1');
    const peer = await new Promise<import('net').Socket>((resolve) => {
      server.once('connection', resolve);
    });
    await new Promise<void>((resolve) => client.once('connect', () => resolve()));
    try {
      expect(sameUserAsPeer(peer)).toBe(true);
    } finally {
      client.destroy();
      peer.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
