import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSpaceStore } from '../store';
import type { SpaceData, HumanizeResponse } from '../types';

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

export function requestHumanize(rawTexts: string[]): Promise<HumanizeResponse> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket.connected) {
      resolve({ texts: {}, usedLLM: false });
      return;
    }
    socket.emit('space:humanize', rawTexts, (result: HumanizeResponse) => {
      resolve(result);
    });
  });
}
