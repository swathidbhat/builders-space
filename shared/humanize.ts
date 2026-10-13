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

const TOOL_VERBS: Record<string, string> = {
  Write: 'Writing',
  Read: 'Reading',
  Edit: 'Editing',
  Shell: 'Running',
  Bash: 'Running',
  Search: 'Searching',
  Grep: 'Searching',
  Glob: 'Finding files',
  WebSearch: 'Researching',
  WebFetch: 'Fetching a page',
  Task: 'Delegating work',
  TodoWrite: 'Planning tasks',
  apply_patch: 'Applying a patch',
};

function toolPhrase(tool: string, detail: string): string {
  const verb = TOOL_VERBS[tool];
  const name = tool.replace(/[_-]+/g, ' ');
  if (verb) {
    if (!detail || detail === 'subtask') return verb;
    return `${verb} ${shortDetail(detail)}`;
  }
  if (!detail) return `Using ${name}`;
  return `Using ${name}: ${shortDetail(detail)}`;
}

function shortDetail(detail: string): string {
  const keep =
    detail.includes('...') ||
    /^(?:\.\/|\/|go |npm |pnpm |yarn |node |pytest |cargo |make )/.test(detail);
  const limit = keep ? 80 : 25;
  if (detail.length <= limit) return detail;
  return detail.slice(0, limit - 3).replace(/\s+\S*$/, '') + '...';
}

/** A plain description of a tool call. Empty or tag-only text stays unclear. */
export function plainActivity(raw: string): string {
  const stripped = strippedText(raw);
  if (!stripped) return UNCLEAR_ACTIVITY;
  if (shouldPassThrough(stripped)) return stripped;

  const colonIdx = stripped.indexOf(':');
  if (
    colonIdx > 0 &&
    colonIdx < 48 &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(stripped.slice(0, colonIdx))
  ) {
    return toolPhrase(stripped.slice(0, colonIdx), stripped.slice(colonIdx + 1).trim());
  }

  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(stripped)) return toolPhrase(stripped, '');
  return UNCLEAR_ACTIVITY;
}

/** What an agent card shows. A stored "Unclear activity" never hides a real reason or a tool call. */
export function visibleActivity(
  raw: string,
  humanized: string | undefined,
  humanLingo: boolean,
): string {
  if (!humanLingo) return raw;
  if (!humanized || humanized === UNCLEAR_ACTIVITY) {
    if (shouldPassThrough(raw)) return raw;
    if (humanized === UNCLEAR_ACTIVITY) {
      const plain = plainActivity(raw);
      if (plain !== UNCLEAR_ACTIVITY) return plain;
    }
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
