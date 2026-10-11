/** Example and obviously-unusable values are not keys. A real Anthropic key is much longer. */
const MIN_USABLE_LENGTH = 20;

const PLACEHOLDERS = new Set([
  'your-api-key-here',
  'your_api_key_here',
  'your-api-key',
  'changeme',
  'replace-me',
  'insert-key-here',
  'sk-ant-xxx',
  'placeholder',
  'example',
  'todo',
  'xxx',
]);

export const ANTHROPIC_KEY_REJECTED = 'Anthropic rejected the API key.';

export type AnthropicKeyState = 'missing' | 'ready' | 'rejected';

let rejected = false;

export function usableAnthropicKey(
  raw: string | undefined = process.env.ANTHROPIC_API_KEY,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim();
  if (!key || key.length < MIN_USABLE_LENGTH) return undefined;
  if (/\s/.test(key)) return undefined;
  const lower = key.toLowerCase();
  if (PLACEHOLDERS.has(lower) || lower.includes('your-api-key') || lower.includes('placeholder')) {
    return undefined;
  }
  return key;
}

export function markAnthropicKeyRejected(): void {
  rejected = true;
}

export function resetAnthropicKeyState(): void {
  rejected = false;
}

export function anthropicKeyState(): AnthropicKeyState {
  if (!usableAnthropicKey()) return 'missing';
  if (rejected) return 'rejected';
  return 'ready';
}

export function isAnthropicAuthRejection(err: unknown): boolean {
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: unknown }).status === 401
  ) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /401|authentication_error|invalid x-api-key|invalid api key/i.test(message);
}
