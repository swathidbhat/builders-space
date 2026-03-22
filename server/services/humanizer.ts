import Anthropic from '@anthropic-ai/sdk';

interface CacheEntry {
  humanized: string;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Rule-based path (no API key or LLM failure): only known `Tool:detail` lines are paraphrased. */
const UNCLEAR_ACTIVITY = 'Unclear activity';

export interface HumanizeResult {
  texts: Record<string, string>;
  usedLLM: boolean;
}

export async function humanizeTexts(rawTexts: string[]): Promise<HumanizeResult> {
  const texts: Record<string, string> = {};
  const uncached: string[] = [];

  for (const raw of rawTexts) {
    const cached = getFromCache(raw);
    if (cached) {
      texts[raw] = cached;
    } else {
      uncached.push(raw);
    }
  }

  if (uncached.length === 0) return { texts, usedLLM: true };

  if (!process.env.ANTHROPIC_API_KEY) {
    for (const raw of uncached) {
      const fb = simpleFallback(raw);
      setInCache(raw, fb);
      texts[raw] = fb;
    }
    return { texts, usedLLM: false };
  }

  const BATCH_SIZE = 20;
  for (let start = 0; start < uncached.length; start += BATCH_SIZE) {
    const batch = uncached.slice(start, start + BATCH_SIZE);
    const batchResults = await callLLM(batch);
    for (let i = 0; i < batch.length; i++) {
      const label = batchResults[i] || simpleFallback(batch[i]);
      setInCache(batch[i], label);
      texts[batch[i]] = label;
    }
  }

  return { texts, usedLLM: true };
}

let anthropic: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (anthropic) return anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  anthropic = new Anthropic();
  return anthropic;
}

async function callLLM(inputs: string[]): Promise<string[]> {
  const client = getClient();
  if (!client) return inputs.map(simpleFallback);

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
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed: string[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const line = lines[i];
      if (line) {
        parsed.push(line.replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, ''));
      } else {
        parsed.push(simpleFallback(inputs[i]));
      }
    }
    return parsed;
  } catch (err) {
    console.error('[Humanizer] LLM call failed:', (err as Error).message);
    return inputs.map(simpleFallback);
  }
}

const TOOL_VERBS: Record<string, string> = {
  Write: 'Writing', Read: 'Reading', Edit: 'Editing',
  Shell: 'Running', Bash: 'Running', Search: 'Searching',
  Grep: 'Searching', Glob: 'Finding files', WebSearch: 'Researching',
  WebFetch: 'Fetching a page', Task: 'Delegating work',
  TodoWrite: 'Planning tasks',
};

function simpleFallback(raw: string): string {
  const stripped = raw.trim().replace(/<[^>]+>/g, '').trim();
  if (!stripped) return UNCLEAR_ACTIVITY;

  const colonIdx = stripped.indexOf(':');
  if (colonIdx > 0 && colonIdx < 20) {
    const tool = stripped.slice(0, colonIdx);
    const detail = stripped.slice(colonIdx + 1).trim();
    const verb = TOOL_VERBS[tool];
    if (verb) {
      if (!detail || detail === 'subtask') return verb;
      const short = detail.length > 25 ? detail.slice(0, 22) + '...' : detail;
      return `${verb} ${short}`;
    }
    return UNCLEAR_ACTIVITY;
  }

  return UNCLEAR_ACTIVITY;
}

function getFromCache(raw: string): string | undefined {
  const entry = cache.get(raw);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(raw);
    return undefined;
  }
  return entry.humanized;
}

function setInCache(raw: string, humanized: string): void {
  if (cache.size >= MAX_CACHE) {
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
  cache.set(raw, { humanized, cachedAt: Date.now() });
}
