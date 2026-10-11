export type {
  AgentSource,
  AgentStatus,
  AgentStatusSource,
  SessionMeta,
  AgentInfo,
  ProjectInfo,
  SpaceData,
  HumanizeResponse,
} from '../shared/types';

import type { HumanizeResponse, SpaceData } from '../shared/types';

export interface ServerToClientEvents {
  'space:state': (state: SpaceData) => void;
}

export interface ClientToServerEvents {
  'space:request-state': () => void;
  'space:humanize': (texts: string[], callback: (result: HumanizeResponse) => void) => void;
}
