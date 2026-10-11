export function logCaught(scope: string, err: unknown, context?: string): void {
  const message = err instanceof Error ? err.message : String(err);
  const detail = context ? `${context}: ${message}` : message;
  console.error(`[${scope}] ${detail}`);
}
