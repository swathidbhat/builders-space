import type { AgentInfo, AgentStatus, ProjectInfo } from '../types';
import type { AgentIdentity } from '../ui/agentIdentity';

export function testIdentity(name = 'Nova'): AgentIdentity {
  return {
    name,
    initial: name[0],
    gradient: ['#ff6b6b', '#ee5a24'],
    hairColor: '#4a3728',
    skinColor: '#e8b88a',
    suitColor: '#ff6b6b',
    suitColorDark: '#993f3f',
    avatarShape: 'circle',
    avatarBorderRadius: '50%',
  };
}

export function testAgent(
  overrides: Partial<AgentInfo> & Pick<AgentInfo, 'id' | 'status'>,
): AgentInfo {
  return {
    source: 'claude-code',
    sessionId: overrides.id,
    lastAction: 'Read:App.tsx',
    ...overrides,
  };
}

export function testProject(
  name: string,
  agents: Array<{ id: string; status: AgentStatus; source?: AgentInfo['source'] }>,
): ProjectInfo {
  return {
    id: name,
    name,
    path: `/tmp/${name}`,
    fileCount: 0,
    agents: agents.map((agent) =>
      testAgent({
        id: agent.id,
        status: agent.status,
        source: agent.source ?? 'claude-code',
        sessionId: agent.id,
      }),
    ),
  };
}
