import type { AgentInfo, ProjectInfo, SessionMeta } from './types';

const AGENT_FIELDS = [
  'id',
  'source',
  'sessionId',
  'status',
  'statusSource',
  'currentTask',
  'lastAction',
  'pendingQuestion',
  'errorReason',
  'startedAt',
  'elapsedMs',
  'lastActivityMs',
  'quietForMs',
  'title',
] as const satisfies readonly (keyof AgentInfo)[];

function sameMeta(a: SessionMeta | undefined, b: SessionMeta | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.projectPath === b.projectPath &&
    a.transcriptPath === b.transcriptPath &&
    a.sessionId === b.sessionId &&
    a.cwd === b.cwd
  );
}

function sameAgent(a: AgentInfo, b: AgentInfo): boolean {
  return AGENT_FIELDS.every((key) => a[key] === b[key]) && sameMeta(a.sessionMeta, b.sessionMeta);
}

function reuseAgent(prev: AgentInfo | undefined, next: AgentInfo): AgentInfo {
  if (prev && sameAgent(prev, next)) return prev;
  return next;
}

function reuseAgents(prev: readonly AgentInfo[], next: readonly AgentInfo[]): AgentInfo[] {
  const reused = next.map((agent, index) => reuseAgent(prev[index], agent));
  if (reused.length === prev.length && reused.every((agent, index) => agent === prev[index])) {
    return prev as AgentInfo[];
  }
  return reused;
}

function reuseProject(prev: ProjectInfo | undefined, next: ProjectInfo): ProjectInfo {
  if (!prev || prev.id !== next.id) return next;
  const agents = reuseAgents(prev.agents, next.agents);
  if (
    agents === prev.agents &&
    prev.name === next.name &&
    prev.path === next.path &&
    prev.fileCount === next.fileCount
  ) {
    return prev;
  }
  return { ...next, agents };
}

/** Keep object identity for projects and agents a snapshot did not change. */
export function reuseProjects(
  prev: readonly ProjectInfo[],
  next: readonly ProjectInfo[],
): ProjectInfo[] {
  const prevById = new Map(prev.map((project) => [project.id, project]));
  const reused = next.map((project) => reuseProject(prevById.get(project.id), project));
  if (reused.length === prev.length && reused.every((project, index) => project === prev[index])) {
    return prev as ProjectInfo[];
  }
  return reused;
}
