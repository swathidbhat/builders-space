import { describe, expect, it, vi } from 'vitest';
import { shouldPassThrough, visibleActivity } from '../../shared/humanize';
import {
  humanizeTexts,
  normalizeHumanizeInput,
  HumanizeInputError,
  HUMANIZE_MAX_ITEMS,
  HUMANIZE_MAX_TEXT_CHARS,
} from '../services/humanizer';
import { anthropicKeyState, resetAnthropicKeyState } from '../anthropicKey';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create };
  },
}));

describe('humanize input limits', () => {
  it('rejects a non-array before any fallback or model call', async () => {
    await expect(humanizeTexts('read the repo')).rejects.toBeInstanceOf(HumanizeInputError);
    await expect(humanizeTexts({ texts: ['Read:a.ts'] })).rejects.toBeInstanceOf(
      HumanizeInputError,
    );
  });

  it('rejects more than the item cap', () => {
    const texts = Array.from({ length: HUMANIZE_MAX_ITEMS + 1 }, (_, i) => `Read:file${i}.ts`);
    expect(() => normalizeHumanizeInput(texts)).toThrow(/at most 20/);
  });

  it('rejects an oversized string', () => {
    expect(() => normalizeHumanizeInput(['x'.repeat(HUMANIZE_MAX_TEXT_CHARS + 1)])).toThrow(
      /exceeds 500/,
    );
  });

  it('rejects a non-string entry', () => {
    expect(() => normalizeHumanizeInput(['Read:a.ts', 12])).toThrow(/must be a string/);
  });

  it('does not report usedLLM when a later request is served from the no-key cache', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const first = await humanizeTexts(['Read:cache-flag-only.ts']);
      expect(first.usedLLM).toBe(false);
      const second = await humanizeTexts(['Read:cache-flag-only.ts']);
      expect(second.usedLLM).toBe(false);
      expect(second.texts['Read:cache-flag-only.ts']).toMatch(/Reading/);
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('accepts a normal batch and uses the local fallback when no API key is set', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await humanizeTexts(['Read:Login.tsx', '']);
      expect(result.usedLLM).toBe(false);
      expect(result.texts['Read:Login.tsx']).toMatch(/Reading/);
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('paraphrases known tools and leaves unknown text unclear', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const raw = [
        'Write:src/App.tsx',
        'Edit:a',
        'Shell:npm test',
        'Bash:',
        'Search:auth',
        'Grep:token',
        'Glob:src/**/*.ts',
        'WebSearch:chokidar',
        'WebFetch:https://example.com/a-very-long-page-name',
        'Task:subtask',
        'TodoWrite:list',
        'Nope:something',
        '<tag>   </tag>',
        'plain sentence without a tool prefix',
        'TypeError: Cannot read properties of undefined (reading "signature")',
        'Should I also backfill existing orders?',
        'Shell:go test ./internal/ratelimit/...',
      ];
      const result = await humanizeTexts(raw);
      expect(result.usedLLM).toBe(false);
      expect(result.texts['Write:src/App.tsx']).toBe('Writing src/App.tsx');
      expect(result.texts['Bash:']).toBe('Running');
      expect(result.texts['Task:subtask']).toBe('Delegating work');
      expect(result.texts['WebFetch:https://example.com/a-very-long-page-name']).toMatch(
        /^Fetching a page /,
      );
      expect(result.texts['Nope:something']).toBe('Unclear activity');
      expect(result.texts['<tag>   </tag>']).toBe('Unclear activity');
      expect(result.texts['plain sentence without a tool prefix']).toBe(
        'plain sentence without a tool prefix',
      );
      expect(
        result.texts['TypeError: Cannot read properties of undefined (reading "signature")'],
      ).toBe('TypeError: Cannot read properties of undefined (reading "signature")');
      expect(result.texts['Should I also backfill existing orders?']).toBe(
        'Should I also backfill existing orders?',
      );
      expect(result.texts['Shell:go test ./internal/ratelimit/...']).toBe(
        'Running go test ./internal/ratelimit/...',
      );
      expect(shouldPassThrough('   ')).toBe(false);
      expect(shouldPassThrough('<b></b>')).toBe(false);
      expect(visibleActivity('Read:App.tsx', 'Reading the app', false)).toBe('Read:App.tsx');
      expect(visibleActivity('Read:App.tsx', 'Reading the app', true)).toBe('Reading the app');
      expect(visibleActivity('TypeError: broken', 'Unclear activity', true)).toBe(
        'TypeError: broken',
      );
      expect(visibleActivity('Nope:something', 'Unclear activity', true)).toBe('Unclear activity');
      expect(visibleActivity('Nope:something', undefined, true)).toBe('Nope:something');
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('uses the model when a key is set, then the cache, then the fallback', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-0123456789abcdef';
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '1. "Reading the login screen"\n2.\n' }],
    });
    try {
      const first = await humanizeTexts(['Read:brand-new-login.tsx', 'Glob:brand-new-pattern']);
      expect(first.usedLLM).toBe(true);
      expect(first.texts['Read:brand-new-login.tsx']).toBe('Reading the login screen');
      expect(first.texts['Glob:brand-new-pattern']).toMatch(/Finding files/);

      create.mockClear();
      const cached = await humanizeTexts(['Read:brand-new-login.tsx']);
      expect(create).not.toHaveBeenCalled();
      expect(cached.usedLLM).toBe(true);
      expect(cached.texts['Read:brand-new-login.tsx']).toBe('Reading the login screen');

      create.mockResolvedValueOnce({ content: [{ type: 'tool_use' }] });
      const empty = await humanizeTexts(['Edit:another-brand-new.ts']);
      expect(empty.texts['Edit:another-brand-new.ts']).toMatch(/Editing/);

      create.mockRejectedValueOnce(new Error('overloaded'));
      const failed = await humanizeTexts(['Shell:brand-new-command']);
      expect(failed.usedLLM).toBe(false);
      expect(failed.error).toMatch(/could not reach/i);
      expect(failed.texts['Shell:brand-new-command']).toMatch(/Running/);

      create.mockResolvedValueOnce({
        content: [{ type: 'text', text: '1. Running the tests' }],
      });
      const retried = await humanizeTexts(['Shell:brand-new-command']);
      expect(retried.usedLLM).toBe(true);
      expect(retried.texts['Shell:brand-new-command']).toBe('Running the tests');
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('drops expired cache entries and evicts the oldest label', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.useFakeTimers();
    try {
      await humanizeTexts(['Write:expires-soon.ts']);
      vi.setSystemTime(Date.now() + 61 * 60 * 1000);
      const refreshed = await humanizeTexts(['Write:expires-soon.ts']);
      expect(refreshed.texts['Write:expires-soon.ts']).toMatch(/Writing/);

      for (let batch = 0; batch < 30; batch++) {
        const texts = Array.from({ length: 20 }, (_, i) => `Read:evict-${batch}-${i}.ts`);
        await humanizeTexts(texts);
      }
      const again = await humanizeTexts(['Read:evict-0-0.ts']);
      expect(again.texts['Read:evict-0-0.ts']).toMatch(/Reading/);
    } finally {
      vi.useRealTimers();
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('treats the example placeholder and other unusable keys as no key', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    create.mockClear();
    try {
      for (const key of ['your-api-key-here', 'test-key', 'short key with spaces', '   ']) {
        process.env.ANTHROPIC_API_KEY = key;
        const result = await humanizeTexts([`Read:${key}.ts`]);
        expect(result.usedLLM).toBe(false);
        expect(result.texts[`Read:${key}.ts`]).toMatch(/Reading/);
      }
      expect(create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('does not cache a 401 as a model translation and reports the rejection', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-0123456789abcdef';
    resetAnthropicKeyState();
    create.mockRejectedValueOnce(
      Object.assign(new Error('401 invalid x-api-key'), { status: 401 }),
    );
    try {
      const failed = await humanizeTexts(['Shell:rejected-key-command']);
      expect(failed.usedLLM).toBe(false);
      expect(failed.error).toMatch(/rejected the API key/);
      expect(failed.texts['Shell:rejected-key-command']).toMatch(/Running/);
      expect(anthropicKeyState()).toBe('rejected');

      create.mockClear();
      create.mockResolvedValueOnce({ content: [{ type: 'text', text: '1. Running a command' }] });
      const again = await humanizeTexts(['Shell:rejected-key-command']);
      expect(create).toHaveBeenCalled();
      expect(again.usedLLM).toBe(true);
    } finally {
      resetAnthropicKeyState();
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
