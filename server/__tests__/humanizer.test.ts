import { describe, it, expect } from 'vitest';
import {
  humanizeTexts,
  normalizeHumanizeInput,
  HumanizeInputError,
  HUMANIZE_MAX_ITEMS,
  HUMANIZE_MAX_TEXT_CHARS,
} from '../services/humanizer';

describe('humanize input limits', () => {
  it('rejects a non-array before any fallback or model call', async () => {
    await expect(humanizeTexts('read the repo')).rejects.toBeInstanceOf(HumanizeInputError);
    await expect(humanizeTexts({ texts: ['Read:a.ts'] })).rejects.toBeInstanceOf(HumanizeInputError);
  });

  it('rejects more than the item cap', () => {
    const texts = Array.from({ length: HUMANIZE_MAX_ITEMS + 1 }, (_, i) => `Read:file${i}.ts`);
    expect(() => normalizeHumanizeInput(texts)).toThrow(/at most 20/);
  });

  it('rejects an oversized string', () => {
    expect(() => normalizeHumanizeInput(['x'.repeat(HUMANIZE_MAX_TEXT_CHARS + 1)])).toThrow(/exceeds 500/);
  });

  it('rejects a non-string entry', () => {
    expect(() => normalizeHumanizeInput(['Read:a.ts', 12])).toThrow(/must be a string/);
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
});
