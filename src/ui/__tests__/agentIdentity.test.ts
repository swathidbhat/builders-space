import { describe, expect, it } from 'vitest';
import { getProjectAgentIdentities } from '../agentIdentity';

describe('agent identity', () => {
  it('gives every agent a stable unique name and a repeatable look', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `agent-${i}`);
    const first = getProjectAgentIdentities(ids);
    const second = getProjectAgentIdentities(ids);
    const names = [...first.values()].map((identity) => identity.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...second.values()].map((identity) => identity.name)).toEqual(names);
    for (const identity of first.values()) {
      expect(identity.initial).toBe(identity.name[0]);
      expect(identity.suitColorDark).not.toBe(identity.suitColor);
      expect(['circle', 'squircle', 'rounded-square']).toContain(identity.avatarShape);
    }
  });
});
