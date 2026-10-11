import { authToken } from './api';
import { backoffMs, parseLaunchToken } from './launchToken';

interface RefreshSocket {
  connected: boolean;
  connect: () => void;
}

let attempt = 0;
let inflight = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function refreshLaunchToken(socket: RefreshSocket): Promise<boolean> {
  const response = await fetch('/', { cache: 'no-store' });
  if (!response.ok) throw new Error('dashboard unavailable');
  const token = parseLaunchToken(await response.text());
  if (!token) throw new Error('missing launch token');
  const previous = authToken();
  window.__BUILDERS_SPACE_TOKEN__ = token;
  if (token !== previous && !socket.connected) socket.connect();
  return token !== previous;
}

/** Re-read the dev server's injected token and reconnect. Retries with backoff. */
export function scheduleTokenRefresh(socket: RefreshSocket): void {
  if (inflight || timer) return;
  inflight = true;
  void refreshLaunchToken(socket).then(
    () => {
      attempt = 0;
      inflight = false;
    },
    () => {
      const delay = backoffMs(attempt);
      attempt += 1;
      inflight = false;
      timer = setTimeout(() => {
        timer = null;
        scheduleTokenRefresh(socket);
      }, delay);
    },
  );
}

export function resetTokenRefreshForTests(): void {
  attempt = 0;
  inflight = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
