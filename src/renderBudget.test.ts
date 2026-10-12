import { describe, expect, it } from 'vitest';
import {
  MOTION_FRAME_MS,
  hasAttentionState,
  motionAlpha,
  nearly,
  pageHidden,
  ringsKeepDrawing,
  surfaceKeepsDrawing,
} from './renderBudget';

describe('render budget', () => {
  it('keeps ring and surface motion at a few frames a second', () => {
    expect(MOTION_FRAME_MS).toBe(250);
    expect(hasAttentionState(['active', 'idle'])).toBe(false);
    expect(hasAttentionState(['active', 'error'])).toBe(true);
    expect(ringsKeepDrawing(true, false, false)).toBe(true);
    expect(ringsKeepDrawing(true, true, false)).toBe(false);
    expect(ringsKeepDrawing(true, false, true)).toBe(false);
    expect(ringsKeepDrawing(false, false, false)).toBe(false);
  });

  it('draws the surface only while an agent is moving and the tab is visible', () => {
    expect(surfaceKeepsDrawing(['rest'], false, false)).toBe(false);
    expect(surfaceKeepsDrawing(['walk', 'rest'], false, false)).toBe(true);
    expect(surfaceKeepsDrawing(['dig'], false, false)).toBe(true);
    expect(surfaceKeepsDrawing(['shake'], false, false)).toBe(true);
    expect(surfaceKeepsDrawing(['walk'], true, false)).toBe(false);
    expect(surfaceKeepsDrawing(['walk'], false, true)).toBe(false);
  });

  it('clamps motion steps and treats a hidden document as paused', () => {
    expect(motionAlpha(0.016, 8)).toBeCloseTo(0.128);
    expect(motionAlpha(1, 8)).toBe(1);
    expect(motionAlpha(0, 8)).toBe(0);
    expect(motionAlpha(Number.NaN, 8)).toBe(0);
    expect(nearly(1, 1.005)).toBe(true);
    expect(nearly(1, 1.2)).toBe(false);
    expect(pageHidden()).toBe(false);
  });
});
