import { HUMANIZE_MAX_ITEMS, HUMANIZE_MAX_TEXT_CHARS } from './config';

export const UNCLEAR_ACTIVITY = 'Unclear activity';

const REAL_REASON =
  /\?|(?:^|[^A-Za-z])(?:TypeError|Error|Exception)\b|\bfailed\b|\bcannot\b|\bshould i\b|\bundefined\b/i;

function strippedText(raw: string): string {
  return raw
    .trim()
    .replace(/<[^>]+>/g, '')
    .trim();
}

function toolShaped(text: string): boolean {
  const colon = text.indexOf(':');
  return colon > 0 && colon < 20 && /^[A-Za-z][A-Za-z0-9]*$/.test(text.slice(0, colon));
}

/**
 * Text that is already plain English, an error, or a question. Human Lingo
 * must show this instead of replacing it with "Unclear activity".
 */
export function shouldPassThrough(raw: string): boolean {
  const stripped = strippedText(raw);
  if (!stripped) return false;
  if (REAL_REASON.test(stripped)) return true;
  if (toolShaped(stripped)) return false;
  return stripped.split(/\s+/).filter(Boolean).length >= 3;
}

/** What an agent card shows. A stored "Unclear activity" never hides a real reason. */
export function visibleActivity(
  raw: string,
  humanized: string | undefined,
  humanLingo: boolean,
): string {
  if (!humanLingo) return raw;
  if (!humanized || humanized === UNCLEAR_ACTIVITY) {
    if (shouldPassThrough(raw)) return raw;
    return humanized || raw;
  }
  return humanized;
}

/** Drop empty and oversized labels before they are sent to the humanizer. */
export function boundHumanizeInput(texts: string[]): string[] {
  const bounded: string[] = [];
  for (const text of texts) {
    if (bounded.length >= HUMANIZE_MAX_ITEMS) break;
    if (text.length === 0 || text.length > HUMANIZE_MAX_TEXT_CHARS) continue;
    bounded.push(text);
  }
  return bounded;
}
