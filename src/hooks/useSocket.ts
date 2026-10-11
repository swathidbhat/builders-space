import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSpaceStore } from '../store';
import type { SpaceData, HumanizeResponse } from '../types';
import { API_ORIGIN, authToken } from '../api';
import { boundHumanizeInput } from '../../shared/humanize';
import { scheduleTokenRefresh } from '../refreshLaunchToken';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    const token = authToken();
    if (!token) {
      console.error(
        '[Socket.IO] Missing launch token. Start with npm run dev so the dashboard can authenticate.',
      );
    }
    sharedSocket = io(API_ORIGIN, {
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        cb({ token: authToken() });
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return sharedSocket;
}

export function useSocket() {
  const setData = useSpaceStore((s) => s.setData);
  const holdPreviousUntil = useSpaceStore((s) => s.holdPreviousUntil);

  useEffect(() => {
    const socket = getSocket();

    function onState(data: SpaceData) {
      setData(data);
    }

    function onConnect() {
      console.log('[Socket.IO] Connected');
      useSpaceStore.getState().markSocketUp();
      socket.emit('space:request-state');
    }

    function onDisconnect() {
      console.log('[Socket.IO] Disconnected');
      useSpaceStore.getState().markDisconnected();
    }

    function onConnectError(err: Error) {
      useSpaceStore.getState().markDisconnected();
      if (/unauthorized/i.test(err?.message ?? '')) scheduleTokenRefresh(socket);
    }

    socket.on('space:state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    if (socket.connected) {
      socket.emit('space:request-state');
    }

    return () => {
      socket.off('space:state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [setData]);

  useEffect(() => {
    if (!Number.isFinite(holdPreviousUntil) || holdPreviousUntil <= 0) return;
    const delay = Math.max(0, holdPreviousUntil - Date.now());
    const timer = setTimeout(() => useSpaceStore.getState().releaseHold(), delay);
    return () => clearTimeout(timer);
  }, [holdPreviousUntil]);
}

export function requestHumanize(rawTexts: string[]): Promise<HumanizeResponse> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket.connected) {
      resolve({ texts: {}, usedLLM: false });
      return;
    }
    socket.emit('space:humanize', boundHumanizeInput(rawTexts), (result: HumanizeResponse) => {
      resolve(result);
    });
  });
}
