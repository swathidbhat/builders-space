/**
 * Turning a project's agents into work parties, and saying what each stalled
 * one now needs from you.
 *
 * One Sonnet 5 call answers all of it, because the questions are entangled:
 * what each agent is trying to achieve, which of them are trying to achieve the
 * same thing, and — for one that has stopped — which decision is now sitting
 * with the human. The last of those is the reason this is a model call at all.
 * An agent rarely ends by asking a clean question; it ends by describing what
 * it built, with the choice it is actually blocked on implied somewhere inside.
 * Relaying that text back is not an answer, it is the same reading work handed
 * to the person who was trying to avoid it.
 *
 * There is no rule-based second mechanism. Grouping by exact task match was
 * one, and it was quietly dishonest: two agents asked the same thing in
 * slightly different words looked unrelated, and it could name no decision at
 * all, because reading past a report to the choice underneath is exactly the
 * judgement a rule cannot make. Better to say nothing than to say something
 * shaped like an answer. When this cannot run, agents carry their names alone.
 *
 * The cost model rests entirely on the cache key, and the cache key rests
 * entirely on the input DTO being narrow. `BriefingAgentInput` carries the id,
 * the task, and — only for agents that have actually stopped — their last
 * message. The state manager emits a fresh agents array several times a second,
 * so admitting `lastAction` or `status` here would churn the key at that rate
 * and bill a call for every tick.
 */
import Anthropic from '@anthropic-ai/sdk';
import { truncateAt } from '../utils/userMessages';

export interface BriefingAgentInput {
  id: string;
  task?: string;
  /**
   * The last thing a stalled agent said to its human.
   *
   * Sent only for agents that are actually waiting — see `briefingInput` on the
   * client. While an agent works this changes every turn, and the cache key is
   * derived from this shape; while it waits it is fixed, which is exactly when
   * a decision needs naming.
   */
  question?: string;
}

export interface AgentIntent {
  id: string;
  intent: string;
  /**
   * What the human must now decide, inferred from the agent's last message.
   * Empty when the agent is not waiting on anyone.
   */
  decision: string;
}

export interface AgentParty {
  id: string;
  goal: string;
  members: AgentIntent[];
}

/**
 * Empty `parties` means nothing is known — no key, a failed call, or an answer
 * too damaged to trust. There is no second mechanism to degrade to, so the
 * surface says nothing rather than something coarse.
 */
export interface BriefingResult {
  parties: AgentParty[];
}

/** The model's answer before repair. Shape-checked, never trusted. */
export interface RawBriefing {
  parties: Array<{
    goal: string;
    members: Array<{ id: string; intent: string; decision: string }>;
  }>;
}

/** The one call this module makes, behind a seam so tests never touch the network. */
export type BriefingTransport = (agents: BriefingAgentInput[]) => Promise<RawBriefing>;

const GOAL_MAX_LEN = 48;
const INTENT_MAX_LEN = 64;
const DECISION_MAX_LEN = 72;
const TASK_MAX_LEN = 240;
const QUESTION_MAX_LEN = 400;

/**
 * Backstop only — the client sends the surface roster, which is capped at five.
 * Anything larger is a malformed request, not a big project.
 */
const MAX_BRIEFING_AGENTS = 8;

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 64;

/** Floor between distinct LLM calls, so a client bug cannot bill in a loop. */
const MIN_CALL_INTERVAL_MS = 3000;

interface CacheEntry {
  result: BriefingResult;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<BriefingResult>>();
let lastCallAt = 0;

let transportOverride: BriefingTransport | null = null;

/** Test seam. Pass `null` to restore the real Anthropic call. */
export function __setBriefingTransport(t: BriefingTransport | null): void {
  transportOverride = t;
  cache.clear();
  inFlight.clear();
  lastCallAt = 0;
}

export async function briefProject(
  agents: BriefingAgentInput[],
): Promise<BriefingResult> {
  if (agents.length === 0) return EMPTY;
  if (agents.length > MAX_BRIEFING_AGENTS) {
    console.warn(`[Briefing] roster of ${agents.length} exceeds the cap; ignoring`);
    return EMPTY;
  }

  const key = briefingKey(agents);

  const cached = getFromCache(key);
  if (cached) return cached;

  // Two sockets, or two ticks either side of the client debounce, must not
  // both pay for the same roster.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const transport = transportOverride ?? defaultTransport();
  if (!transport) {
    // Not cached: a key can arrive without restarting the app, and caching the
    // silence would keep the surface blank for half an hour after it did.
    console.warn('[Briefing] no ANTHROPIC_API_KEY — agents will show names only');
    return EMPTY;
  }

  const asked = trimForRequest(agents);
  // Nothing worth asking about: every agent is silent and taskless.
  if (asked.length === 0) return cacheAndReturn(key, EMPTY);

  const run = (async (): Promise<BriefingResult> => {
    try {
      // The floor waits rather than refuses. With nothing to degrade to,
      // refusing would hand back silence for a roster we are perfectly able to
      // brief a moment later — and the cache plus in-flight de-duplication
      // already stop the only case this was built for, the same roster asked
      // repeatedly. What is left is someone moving between planets quickly,
      // which deserves an answer, just a paced one.
      const wait = MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCallAt = Date.now();

      const raw = await transport(asked);
      const parties = repairBriefing(raw, agents, new Set(asked.map((a) => a.id)));
      if (!parties) {
        console.warn('[Briefing] answer dropped too much of the roster; discarding');
        return EMPTY;
      }
      return { parties };
    } catch (err) {
      console.error('[Briefing] call failed:', (err as Error).message);
      return EMPTY;
    }
  })();

  inFlight.set(key, run);
  try {
    const result = await run;
    // Only a real answer is worth remembering. Caching a failure would outlive
    // whatever caused it.
    return result.parties.length > 0 ? cacheAndReturn(key, result) : result;
  } finally {
    inFlight.delete(key);
  }
}

const EMPTY: BriefingResult = { parties: [] };

/**
 * The identity of a roster snapshot.
 *
 * Content-derived, because the socket hands out a fresh array every tick.
 * Sorted, because watcher scan order is not stable. Normalised, because a
 * trailing newline in a transcript is not a new goal.
 */
export function briefingKey(agents: BriefingAgentInput[]): string {
  return agents
    .map((a) => `${a.id}${normalizeTask(a.task)}${normalizeTask(a.question)}`)
    .sort()
    .join('');
}

export function normalizeTask(task: string | undefined): string {
  return (task ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?,;:]+$/, '');
}

/**
 * The model's answer, made safe to render.
 *
 * Returns `null` when the answer is too damaged to trust — which is why the
 * caller can fall back wholesale rather than rendering a half-repaired result.
 */
export function repairBriefing(
  raw: RawBriefing,
  agents: BriefingAgentInput[],
  /**
   * The ids actually sent. Agents with neither a task nor a question are held
   * back from the request, so the model was never asked about them and cannot
   * be judged for omitting them — counting them as dropped made any project
   * where half the agents parsed to nothing fall back without ever calling.
   */
  asked?: Set<string>,
): AgentParty[] | null {
  const known = new Set(agents.map((a) => a.id));
  const claimed = new Set<string>();
  const parties: AgentParty[] = [];

  for (const party of raw.parties) {
    const members: AgentIntent[] = [];
    for (const member of party.members) {
      if (!known.has(member.id)) continue;
      if (claimed.has(member.id)) continue;
      claimed.add(member.id);
      members.push({
        id: member.id,
        intent: truncateAt(String(member.intent ?? '').trim(), INTENT_MAX_LEN),
        decision: truncateAt(String(member.decision ?? '').trim(), DECISION_MAX_LEN),
      });
    }
    if (members.length === 0) continue;
    parties.push(makeParty(truncateAt(String(party.goal ?? '').trim(), GOAL_MAX_LEN), members));
  }

  const missing = agents.filter((a) => !claimed.has(a.id));

  // A model that dropped half of what it was *asked about* misunderstood the
  // task; the parties it did return are not more trustworthy than the ones it
  // forgot. Judged against the request, not the roster.
  const dropped = asked ? missing.filter((a) => asked.has(a.id)).length : missing.length;
  const judged = asked ? asked.size : agents.length;
  if (dropped * 2 > judged) return null;

  for (const agent of missing) {
    parties.push(makeParty('', [{ id: agent.id, intent: '', decision: '' }]));
  }

  return sortParties(parties);
}

/**
 * Party identity from membership alone: stable while the same agents work
 * together, new the moment they do not. Used as a React key and a label
 * identity — never as an input to placement.
 */
function makeParty(goal: string, members: AgentIntent[]): AgentParty {
  const sorted = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { id: `party-${sorted[0].id}`, goal, members: sorted };
}

function sortParties(parties: AgentParty[]): AgentParty[] {
  return [...parties].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function trimForRequest(agents: BriefingAgentInput[]): BriefingAgentInput[] {
  return agents
    .filter((a) => (a.task ?? '').trim() || (a.question ?? '').trim())
    .map((a) => {
      const out: BriefingAgentInput = {
        id: a.id,
        task: truncateAt((a.task ?? '').trim(), TASK_MAX_LEN),
      };
      // Longer than the task cap: the decision is usually buried near the end
      // of a long report, so trimming hard here throws away the thing we came
      // for. Only stalled agents carry one, so this is not paid per agent.
      const q = (a.question ?? '').trim();
      if (q) out.question = truncateAt(q, QUESTION_MAX_LEN);
      return out;
    });
}

function getFromCache(key: string): BriefingResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

function cacheAndReturn(key: string, result: BriefingResult): BriefingResult {
  if (cache.size >= MAX_CACHE) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { result, cachedAt: Date.now() });
  return result;
}

// --- The Anthropic call --------------------------------------------------

const BRIEFING_SYSTEM = `You watch a live dashboard for a non-technical builder. You do two things: group their coding agents into work parties, and tell them what each stalled agent now needs them to decide.

Each agent has an id and the task its human last asked it to do. An agent that has stopped also has a \`question\`: the last thing it said to that human.

Grouping:
- Put agents in the same party only when they are working toward the same outcome. Two agents touching the same repo for unrelated reasons are NOT one party.
- Prefer fewer, honest parties over many. When in doubt, leave an agent on its own.
- Every input id must appear in exactly one party. Never invent an id. Never drop one.
- \`goal\` is 3-6 plain words naming the outcome, e.g. "Ship the checkout flow". No file names, no tool names, no file extensions, no CLI flags.
- \`intent\` is 5-8 plain words for what that one agent is contributing to the goal.
- Describe the goal, not the mechanics. Do not use the word "working" unless nothing more specific is knowable.

Decisions:
- \`decision\` names what the *human* must now do, in 3-8 plain words starting with a verb: "Choose which of the four drafts to post", "Approve the retry policy", "Say which database to use".
- Work out the decision. Do not summarise or repeat what the agent said. An agent that ends with a wall of text describing what it built is usually waiting on approval of one specific thing — name that thing. The question is often buried under the report, or implied by it rather than asked outright.
- Address the human as the one deciding. Never phrase it as what the agent will do next.
- If an agent has no \`question\`, or its message only reports finished work and asks nothing, \`decision\` is "".`;

/**
 * Membership is nested inside the party rather than carried in a parallel
 * array. Assignment is then structural, so there is no index to slip — the
 * failure mode the old line-by-line humanizer had.
 *
 * Length caps live in the prompt and in `repairBriefing`, not here: structured
 * outputs reject `minLength`/`maxItems` and friends.
 */
const BRIEFING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['parties'],
  properties: {
    parties: {
      type: 'array',
      description: 'One entry per distinct goal. Every agent id appears in exactly one party.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['goal', 'members'],
        properties: {
          goal: {
            type: 'string',
            description: 'The shared goal in 3-6 plain words, no tool or file names.',
          },
          members: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'intent', 'decision'],
              properties: {
                id: { type: 'string', description: 'Verbatim agent id from the input.' },
                intent: {
                  type: 'string',
                  description: "This agent's own contribution, 5-8 plain words.",
                },
                decision: {
                  type: 'string',
                  description:
                    'What the human must now decide, 3-8 plain words starting with a verb. Empty string when the agent is waiting on nobody.',
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * The `parse` method is what makes `response.parsed_output` typed. Without it
 * the SDK resolves the parsed type to `null` and the value needs a double cast.
 * `JSON.stringify` drops the function, so it never reaches the wire.
 */
const BRIEFING_FORMAT = {
  type: 'json_schema' as const,
  schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
  parse: (raw: string): RawBriefing => validateRawBriefing(JSON.parse(raw)),
};

export function validateRawBriefing(value: unknown): RawBriefing {
  const parties = (value as RawBriefing)?.parties;
  if (!Array.isArray(parties)) throw new Error('briefing: parties is not an array');
  for (const party of parties) {
    if (!party || typeof party.goal !== 'string' || !Array.isArray(party.members)) {
      throw new Error('briefing: malformed party');
    }
    for (const member of party.members) {
      if (!member || typeof member.id !== 'string') {
        throw new Error('briefing: malformed member');
      }
    }
  }
  return { parties };
}

const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

/** The installed SDK types effort as low/medium/high/max — there is no `xhigh`. */
function readEffort(raw: string | undefined): Effort {
  return (EFFORT_LEVELS as readonly string[]).includes(raw ?? '')
    ? (raw as Effort)
    : 'low';
}

let anthropic: Anthropic | null = null;

function defaultTransport(): BriefingTransport | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) anthropic = new Anthropic();
  const client = anthropic;

  return async (agents) => {
    const response = await client.messages.parse({
      model: process.env.BRIEFING_MODEL || 'claude-sonnet-5',
      max_tokens: 1024,
      // Explicit, not omitted. Sonnet 5 runs adaptive thinking by default and
      // `max_tokens` caps thinking and output together, so the default would
      // truncate the JSON mid-object at this budget.
      thinking: { type: 'disabled' },
      output_config: {
        effort: readEffort(process.env.BRIEFING_EFFORT),
        format: BRIEFING_FORMAT,
      },
      system: BRIEFING_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({ agents }) }],
    });

    if (!response.parsed_output) throw new Error('briefing: no parsed output');
    return response.parsed_output;
  };
}
