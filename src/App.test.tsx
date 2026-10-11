// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./scene/SpaceScene', () => ({
  SpaceScene: () => null,
}));

vi.mock('./hooks/useSocket', () => ({
  useSocket: () => undefined,
  requestHumanize: async () => ({ texts: {}, usedLLM: false }),
}));

import { App } from './App';

describe('App', () => {
  it('mounts the dashboard chrome', () => {
    render(<App />);
    expect(screen.getByText('Builders Space')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
  });
});
