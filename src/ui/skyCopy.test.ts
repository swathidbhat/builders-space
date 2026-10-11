import { describe, expect, it } from 'vitest';
import { EMPTY_SCAN_MS, skyPhase } from './skyCopy';

describe('skyPhase', () => {
  const base = {
    projectCount: 0,
    snapshotSeen: true,
    scanStartedAt: 1_000,
    now: 1_000,
  };

  it('stays on loading until a snapshot, then times out the search', () => {
    expect(skyPhase({ ...base, connection: 'connecting', snapshotSeen: false })).toBe('loading');
    expect(skyPhase({ ...base, connection: 'live', now: 1_000 + EMPTY_SCAN_MS - 1 })).toBe(
      'searching',
    );
    expect(skyPhase({ ...base, connection: 'live', now: 1_000 + EMPTY_SCAN_MS })).toBe('empty');
  });

  it('keeps a disconnected sky on the retry phase even when planets are known', () => {
    expect(skyPhase({ ...base, connection: 'stale', projectCount: 2 })).toBe('retrying');
    expect(skyPhase({ ...base, connection: 'live', projectCount: 2 })).toBe('ready');
  });
});
