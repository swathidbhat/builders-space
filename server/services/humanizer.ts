import Anthropic from '@anthropic-ai/sdk';
import {
  HUMANIZE_CACHE_MAX,
  HUMANIZE_CACHE_TTL_MS,
  HUMANIZE_MAX_ITEMS,
  HUMANIZE_MAX_TEXT_CHARS,
} from '../../shared/config';
import {
  ANTHROPIC_KEY_REJECTED,
  isAnthropicAuthRejection,
  markAnthropicKeyRejected,
  usableAnthropicKey,
} from '../anthropicKey';
import { shouldPassThrough, UNCLEAR_ACTIVITY } from '../../shared/humanize';

export { HUMANIZE_MAX_ITEMS, HUMANIZE_MAX_TEXT_CHARS, UNCLEAR_ACTIVITY };

interface CacheEntry {
  humanized: string;
  cachedAt: number;
  fromLLM: boolean;
}

const cache = new Map<string, CacheEntry>();

/** Rule-based path (no API key or LLM failure): known tools are paraphrased; plain English is kept. */

export interface HumanizeResult {
  texts: Record<string, string>;
  usedLLM: boolean;
  error?: string;
}

export class HumanizeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HumanizeInputError';
  }
}

export function normalizeHumanizeInput(rawTexts: unknown): string[] {
  if (!Array.isArray(rawTexts)) {
    throw new HumanizeInputError('texts must be an array of strings');
  }
  if (rawTexts.length > HUMANIZE_MAX_ITEMS) {
    throw new HumanizeInputError(`at most ${HUMANIZE_MAX_ITEMS} texts per request`);
  }
  return rawTexts.map((item, index) => {
    if (typeof item !== 'string') {
      throw new HumanizeInputError(`texts[${index}] must be a string`);
    }
    if (item.length > HUMANIZE_MAX_TEXT_CHARS) {
      throw new HumanizeInputError(`texts[${index}] exceeds ${HUMANIZE_MAX_TEXT_CHARS} characters`);
    }
    return item;
  });
}

export async function humanizeTexts(rawTexts: unknown): Promise<HumanizeResult> {
  const inputs = normalizeHumanizeInput(rawTexts);
  const texts: Record<string, string> = {};
  const uncached: string[] = [];

  for (const raw of inputs) {
    const cached = getFromCache(raw);
    if (cached) {
      texts[raw] = cached;
    } else {
      uncached.push(raw);
    }
  }

  if (uncached.length === 0) {
    return { texts, usedLLM: inputs.length > 0 && inputs.every((raw) => cacheFromLLM(raw)) };
  }

  if (!usableAnthropicKey()) {
    for (const raw of uncached) {
      const fb = simpleFallback(raw);
      setInCache(raw, fb, false);
      texts[raw] = fb;
    }
    return { texts, usedLLM: false };
  }

  const BATCH_SIZE = 20;
  let usedLLM = true;
  let error: string | undefined;
  for (let start = 0; start < uncached.length; start += BATCH_SIZE) {
    const batch = uncached.slice(start, start + BATCH_SIZE);
    const batchResults = await callLLM(batch);
    if (!batchResults.fromLLM) {
      usedLLM = false;
      error = batchResults.error;
      for (let i = 0; i < batch.length; i++) {
        texts[batch[i]] = batchResults.labels[i] || simpleFallback(batch[i]);
      }
      break;
    }
    for (let i = 0; i < batch.length; i++) {
      const label = batchResults.labels[i] || simpleFallback(batch[i]);
      setInCache(batch[i], label, true);
      texts[batch[i]] = label;
    }
  }

  return error ? { texts, usedLLM, error } : { texts, usedLLM };
}

interface LlmBatch {
  labels: string[];
  fromLLM: boolean;
  error?: string;
}

let anthropic: Anthropic | null = null;
let clientKey: string | null = null;

function getClient(): Anthropic | null {
  const key = usableAnthropicKey();
  if (!key) {
    anthropic = null;
    clientKey = null;
    return null;
  }
  if (anthropic && clientKey === key) return anthropic;
  anthropic = new Anthropic({ apiKey: key });
  clientKey = key;
  return anthropic;
}

async function callLLM(inputs: string[]): Promise<LlmBatch> {
  const client = getClient();
  if (!client) return { labels: inputs.map(simpleFallback), fromLLM: false };

  try {
    const numbered = inputs.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const model = process.env.HUMANIZER_MODEL || 'claude-haiku-4-5-20251001';

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: `You translate coding-agent activity into short status labels (5-8 words) for a non-technical decision-making builder.

Rules:
- Use simple, everyday language to explain what an agent is currently doing that a non-engineer would understand
- Be specific about WHAT is happening, not HOW
- Never mention file extensions, CLI flags, or tool names
- Use verbs ("Adding...", "Fixing...", "Setting up...")
- Infer intent from messy, XML-heavy, or fragmented input — do not default to a generic word like "Working" unless the activity is genuinely ongoing work
- Do NOT add numbering, quotes, or any extra formatting — just the label`,
      messages: [{ role: 'user', content: `Translate each input:\n${numbered}` }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: string[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const line = lines[i];
      if (line) {
        parsed.push(line.replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, ''));
      } else {
        parsed.push(simpleFallback(inputs[i]));
      }
    }
    return { labels: parsed, fromLLM: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Humanizer] LLM call failed:', message);
    if (isAnthropicAuthRejection(err)) {
      markAnthropicKeyRejected();
      return {
        labels: inputs.map(simpleFallback),
        fromLLM: false,
        error: ANTHROPIC_KEY_REJECTED,
      };
    }
    return {
      labels: inputs.map(simpleFallback),
      fromLLM: false,
      error: 'Human Lingo could not reach Anthropic.',
    };
  }
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
};

function shortDetail(detail: string): string {
  const keep =
    detail.includes('...') ||
    /^(?:\.\/|\/|go |npm |pnpm |yarn |node |pytest |cargo |make )/.test(detail);
  const limit = keep ? 80 : 25;
  if (detail.length <= limit) return detail;
  return detail.slice(0, limit - 3).replace(/\s+\S*$/, '') + '...';
}

function simpleFallback(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/<[^>]+>/g, '')
    .trim();
  if (!stripped) return UNCLEAR_ACTIVITY;

  const colonIdx = stripped.indexOf(':');
  if (colonIdx > 0 && colonIdx < 20 && /^[A-Za-z][A-Za-z0-9]*$/.test(stripped.slice(0, colonIdx))) {
    const tool = stripped.slice(0, colonIdx);
    const detail = stripped.slice(colonIdx + 1).trim();
    const verb = TOOL_VERBS[tool];
    if (verb) {
      if (!detail || detail === 'subtask') return verb;
      return `${verb} ${shortDetail(detail)}`;
    }
  }

  if (shouldPassThrough(stripped)) return stripped;
  return UNCLEAR_ACTIVITY;
}

function getFromCache(raw: string): string | undefined {
  const entry = freshCacheEntry(raw);
  return entry?.humanized;
}

function cacheFromLLM(raw: string): boolean {
  return freshCacheEntry(raw)?.fromLLM === true;
}

function freshCacheEntry(raw: string): CacheEntry | undefined {
  const entry = cache.get(raw);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > HUMANIZE_CACHE_TTL_MS) {
    cache.delete(raw);
    return undefined;
  }
  return entry;
}

function setInCache(raw: string, humanized: string, fromLLM: boolean): void {
  if (cache.size >= HUMANIZE_CACHE_MAX) {
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldest = key;
      }
    }
    if (oldest) cache.delete(oldest);
  }
  cache.set(raw, { humanized, cachedAt: Date.now(), fromLLM });
}
