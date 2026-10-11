export { API_ORIGIN } from '../shared/config';

declare global {
  interface Window {
    __BUILDERS_SPACE_TOKEN__?: string;
  }
}

export function authToken(): string {
  if (typeof window === 'undefined') return '';
  return window.__BUILDERS_SPACE_TOKEN__ ?? '';
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken()}`,
    ...extra,
  };
}
