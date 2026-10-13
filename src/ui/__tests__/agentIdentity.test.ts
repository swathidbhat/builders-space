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
      for (const color of identity.gradient) expect(clashesWithStatus(color)).toBe(false);
      expect(clashesWithStatus(identity.suitColor)).toBe(false);
    }
  });
});

function clashesWithStatus(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.2) return false;
  const delta = max - min;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue <= 55 || hue >= 340) return true;
  return hue >= 85 && hue <= 155;
}
