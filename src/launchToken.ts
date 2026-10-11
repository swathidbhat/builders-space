const TOKEN_PATTERN = /window\.__BUILDERS_SPACE_TOKEN__=("[^"]*"|'[^']*')/;

/** Pull the per-launch token out of the dashboard HTML the dev server injects. */
export function parseLaunchToken(html: string): string | null {
  const match = TOKEN_PATTERN.exec(html);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** 1s, 2s, 4s, then 8s. */
export function backoffMs(attempt: number): number {
  const step = Math.max(0, attempt);
  return Math.min(8000, 1000 * 2 ** step);
}
