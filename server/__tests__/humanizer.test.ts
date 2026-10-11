import { describe, expect, it, vi } from 'vitest';
import {
  humanizeTexts,
  normalizeHumanizeInput,
  HumanizeInputError,
  HUMANIZE_MAX_ITEMS,
  HUMANIZE_MAX_TEXT_CHARS,
} from '../services/humanizer';

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
      expect(result.texts['plain sentence without a tool prefix']).toBe('Unclear activity');
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('uses the model when a key is set, then the cache, then the fallback', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
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
      expect(failed.texts['Shell:brand-new-command']).toMatch(/Running/);
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
});
