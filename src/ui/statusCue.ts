import type { AgentStatus } from '../../shared/types';

export const STATUS_MARK: Record<AgentStatus | 'empty', string> = {
  error: '!',
  waiting: '?',
  working: '▸',
  done: '●',
  empty: '○',
};

export const STATUS_WORD: Record<AgentStatus | 'empty', string> = {
  error: 'Error',
  waiting: 'Needs you',
  working: 'Working',
  done: 'Done',
  empty: 'No agents',
};
