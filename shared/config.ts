/** Ports, URLs, and timings shared by the server and the dashboard. */

export const SERVER_PORT = 3002;
export const CLIENT_PORT = 5174;
export const API_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const MAX_SESSION_AGE_MS = 48 * ONE_HOUR_MS;
/** Transcript activity newer than this is "working" without a live process. */
export const RECENT_ACTIVITY_MS = 2 * 60 * 1000;
/** A live process with no new output for this long is "waiting". */
export const STALE_PROCESS_MS = 10 * 60 * 1000;

export const HOOK_ACTIVE_TTL_MS = 600_000;
export const HOOK_TERMINAL_TTL_MS = 3_600_000;
export const STALE_EVENT_MAX_AGE_MS = 60_000;

export const WATCH_DEBOUNCE_MS = 300;
export const FALLBACK_SCAN_MS = 60_000;
export const MISSING_DIR_RETRY_MS = 15_000;
export const PROCESS_SCAN_TIMEOUT_MS = 3_000;
/** How often a watcher refreshes the process list off the scan path. */
export const PROCESS_REFRESH_MS = 5_000;

export const HUMANIZE_MAX_ITEMS = 20;
export const HUMANIZE_MAX_TEXT_CHARS = 500;
export const HUMANIZE_CACHE_MAX = 500;
export const HUMANIZE_CACHE_TTL_MS = ONE_HOUR_MS;
/** Cap the dashboard's translated-label cache so a long session cannot grow it without bound. */
export const CLIENT_TRANSLATION_CACHE_MAX = 200;
