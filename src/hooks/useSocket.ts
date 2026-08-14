import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSpaceStore } from '../store';
import type { SpaceData, BriefingAgentInput, BriefingResponse } from '../types';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io('http://localhost:3002', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return sharedSocket;
}

export function useSocket() {
  const setData = useSpaceStore((s) => s.setData);

  useEffect(() => {
    const socket = getSocket();

    function onState(data: SpaceData) {
      setData(data);
    }

    socket.on('space:state', onState);
    socket.on('connect', () => {
      console.log('[Socket.IO] Connected');
      socket.emit('space:request-state');
    });
    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
    });

    if (socket.connected) {
      socket.emit('space:request-state');
    }

    return () => {
      socket.off('space:state', onState);
    };
  }, [setData]);
}

/** How long to wait for an ack before giving up and letting the caller retry. */
const ACK_TIMEOUT_MS = 8000;

/**
 * Emit with an ack, and always settle.
 *
 * Socket.IO acks have no timeout of their own: a server that never calls back
 * leaves the promise pending forever. That matters here because the briefing's
 * request guard is stable by design — one dropped ack without this would leave
 * the landed project with no text at all until you flew away and back.
 */
function withAck<T>(
  event: string,
  payload: unknown,
  fallback: T,
  timeoutMs = ACK_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket.connected) {
      resolve(fallback);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    socket.emit(event, payload, (result: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    });
  });
}

export function requestBriefing(
  agents: BriefingAgentInput[],
): Promise<BriefingResponse> {
  return withAck<BriefingResponse>('space:brief', agents, { parties: [] });
}
