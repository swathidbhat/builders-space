import { describe, it, expect } from 'vitest';
import {
  meaningfulAgentText,
  meaningfulUserText,
  firstSentence,
  truncateAt,
  SYNTHETIC_PREFIXES,
  CONTINUATION_WORDS,
  TASK_MAX_LEN,
  QUESTION_MAX_LEN,
} from '../utils/userMessages';

describe('meaningfulUserText', () => {
  // Iterated rather than spelled out, so adding a prefix without a case here
  // shows up as an untested entry rather than passing silently.
  it.each(SYNTHETIC_PREFIXES)('rejects the machine-written turn %j', (prefix) => {
    expect(meaningfulUserText(`${prefix} and then some trailing text`)).toBeUndefined();
  });

  it.each(CONTINUATION_WORDS)('rejects the bare acknowledgement %j', (word) => {
    expect(meaningfulUserText(word)).toBeUndefined();
    expect(meaningfulUserText(`${word.toUpperCase()}.`)).toBeUndefined();
  });

  it('keeps an ordinary request', () => {
    expect(meaningfulUserText('add rate limiting to the upload endpoint')).toBe(
      'add rate limiting to the upload endpoint',
    );
  });

  it('keeps a short request that only looks like an acknowledgement', () => {
    // "next" is a continuation; "next page" is a request.
    expect(meaningfulUserText('next page')).toBe('next page');
  });

  it('trims but does not otherwise rewrite', () => {
    expect(meaningfulUserText('  fix the flaky test  ')).toBe('fix the flaky test');
  });

  it('returns undefined for empty and missing input', () => {
    expect(meaningfulUserText(undefined)).toBeUndefined();
    expect(meaningfulUserText('')).toBeUndefined();
    expect(meaningfulUserText('   \n  ')).toBeUndefined();
  });

  it('truncates a long request', () => {
    const long = 'x'.repeat(500);
    const out = meaningfulUserText(long)!;
    expect(out.length).toBeLessThanOrEqual(TASK_MAX_LEN);
    expect(out.endsWith('...')).toBe(true);
  });

  describe('unwrapping Codex ambient context', () => {
    it('takes the request out from under an in-app-browser preamble', () => {
      const raw = [
        '# In app browser:',
        '- The user has the in-app browser open.',
        '- Current URL: http://localhost:5173/',
        '',
        '## My request for Codex:',
        'the login button is misaligned',
      ].join('\n');
      expect(meaningfulUserText(raw)).toBe('the login button is misaligned');
    });

    it('takes the request out from under an attached-files manifest', () => {
      const raw = [
        '# Files mentioned by the user:',
        '',
        '## Screenshot.png: /tmp/Screenshot.png',
        '',
        '## My request for Codex:',
        'this is what I get when I hit start',
      ].join('\n');
      expect(meaningfulUserText(raw)).toBe('this is what I get when I hit start');
    });

    it('unwraps a marker with no trailing colon', () => {
      expect(meaningfulUserText('# Selected text:\n\n## My request\nmake it shorter')).toBe(
        'make it shorter',
      );
    });

    it('takes the last marker when context is layered', () => {
      const raw = [
        '# Files mentioned by the user:',
        '## My request for Codex:',
        'stale first request',
        '# In app browser:',
        '## My request for Codex:',
        'the real one',
      ].join('\n');
      expect(meaningfulUserText(raw)).toBe('the real one');
    });

    it('rejects the classifier prompt rather than unwrapping the transcript it quotes', () => {
      // The classifier prompt embeds a whole prior conversation, markers and
      // all. Unwrapping first would surface a fragment of someone else's work
      // as this agent's goal — which is why the reject list runs before the
      // unwrap, and why this case is worth pinning.
      const raw = [
        'The following is the Codex agent history whose request action you are assessing.',
        '>>> TRANSCRIPT START',
        '[1] user:',
        '## My request for Codex:',
        'somebody elses task entirely',
      ].join('\n');
      expect(meaningfulUserText(raw)).toBeUndefined();
    });
  });

  describe('CLI constructs', () => {
    it.each([
      '<command-name>/model</command-name>',
      '<local-command-stdout>Set model to sonnet</local-command-stdout>',
      '<local-command-caveat>Caveat: ...</local-command-caveat>',
      '<create-pr-command> ## Overview  Create a PR</create-pr-command>',
    ])('rejects %j', (raw) => {
      expect(meaningfulUserText(raw)).toBeUndefined();
    });

    it('does not reject prose that merely mentions a tag', () => {
      expect(meaningfulUserText('the <div> wrapper is missing a class')).toBe(
        'the <div> wrapper is missing a class',
      );
    });
  });
});

describe('meaningfulAgentText', () => {
  it('keeps a question to a human', () => {
    expect(meaningfulAgentText('Should I use Postgres or SQLite here?')).toBe(
      'Should I use Postgres or SQLite here?',
    );
  });

  it('rejects a serialized classifier verdict', () => {
    // Both CLIs run internal classifiers as ordinary sessions in the same
    // transcript directory; their assistant turn is machine correspondence.
    expect(
      meaningfulAgentText('{"risk_level":"low","outcome":"allow","rationale":"safe"}'),
    ).toBeUndefined();
    expect(meaningfulAgentText('[{"outcome":"allow"}]')).toBeUndefined();
  });

  it('keeps prose that merely opens with a brace', () => {
    expect(meaningfulAgentText('{count} is undefined at line 4 — which did you mean?')).toBe(
      '{count} is undefined at line 4 — which did you mean?',
    );
  });

  it('truncates a long answer', () => {
    const out = meaningfulAgentText('y'.repeat(900))!;
    expect(out.length).toBeLessThanOrEqual(QUESTION_MAX_LEN);
    expect(out.endsWith('...')).toBe(true);
  });

  it('returns undefined for empty and missing input', () => {
    expect(meaningfulAgentText(undefined)).toBeUndefined();
    expect(meaningfulAgentText('  ')).toBeUndefined();
  });
});

describe('firstSentence', () => {
  it('stops at the first sentence', () => {
    expect(firstSentence('Fixed the parser. Then ran the tests.', 80)).toBe(
      'Fixed the parser.',
    );
  });

  it('stops at the first line when there is no sentence break', () => {
    expect(firstSentence('Fixed the parser\nThen ran the tests', 80)).toBe(
      'Fixed the parser',
    );
  });

  it('strips markdown headings', () => {
    expect(firstSentence('## Summary\nAll good', 80)).toBe('Summary');
  });

  it('truncates a long single sentence', () => {
    const out = firstSentence('word '.repeat(60), 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('...')).toBe(true);
  });
});

describe('truncateAt', () => {
  it('leaves short text alone', () => {
    expect(truncateAt('short', 40)).toBe('short');
  });

  it('backs up to a word boundary', () => {
    expect(truncateAt('the quick brown fox jumps', 16)).toBe('the quick...');
  });

  it('never exceeds the cap', () => {
    for (const len of [8, 12, 40, 200]) {
      expect(truncateAt('lorem ipsum dolor sit amet consectetur'.repeat(4), len).length)
        .toBeLessThanOrEqual(len);
    }
  });

  it('still cuts when there is no whitespace to back up to', () => {
    const out = truncateAt('z'.repeat(100), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('...')).toBe(true);
  });
});
