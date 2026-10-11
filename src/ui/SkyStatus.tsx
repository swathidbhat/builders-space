import { useEffect, useState } from 'react';
import { API_ORIGIN, authHeaders } from '../api';
import { useSpaceStore } from '../store';
import { skyPhase } from './skyCopy';
import { useSkyClock } from './useSkyClock';
import styles from './SkyStatus.module.css';

type ToolStatus = 'configured' | 'available' | 'not_installed';

interface HookStatusResponse {
  claude: ToolStatus;
  cursor: ToolStatus;
  codex: ToolStatus;
}

const TOOLS = [
  { key: 'claude', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'codex', label: 'Codex' },
] as const;

function foundLabel(status: ToolStatus | undefined): string {
  if (!status) return 'not checked yet';
  return status === 'not_installed' ? 'not found' : 'found';
}

export function SkyStatus() {
  const projects = useSpaceStore((s) => s.projects);
  const connection = useSpaceStore((s) => s.connection);
  const snapshotSeen = useSpaceStore((s) => s.snapshotSeen);
  const scanStartedAt = useSpaceStore((s) => s.scanStartedAt);
  const now = useSkyClock();
  const [tools, setTools] = useState<HookStatusResponse | null>(null);
  const [toolsFailed, setToolsFailed] = useState(false);

  const phase = skyPhase({
    connection,
    projectCount: projects.length,
    snapshotSeen,
    scanStartedAt,
    now,
  });

  useEffect(() => {
    if (phase !== 'empty') return;
    const controller = new AbortController();
    fetch(`${API_ORIGIN}/api/hooks/status`, { headers: authHeaders(), signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('status failed');
        return res.json() as Promise<HookStatusResponse>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setTools(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setToolsFailed(true);
      });
    return () => controller.abort();
  }, [phase]);

  if (phase !== 'empty') return null;

  return (
    <div className={styles.wrap}>
      <section className={styles.card} aria-label="No sessions yet">
        <h2 className={styles.title}>No sessions yet</h2>
        <p>
          Builders Space watches this machine for coding-agent sessions. A planet shows up when a
          session file is written under <code>~/.claude/projects</code>,{' '}
          <code>~/.cursor/projects</code>, or <code>~/.codex/sessions</code>.
        </p>
        <ul className={styles.tools}>
          {TOOLS.map((tool) => (
            <li key={tool.key}>
              {tool.label}: {toolsFailed ? 'not checked' : foundLabel(tools?.[tool.key])}
            </li>
          ))}
        </ul>
        <p>
          Next: start a session in one of those tools, in a project on this computer. Discovery
          works on Linux and macOS. Opening a session from a card is macOS-only.
        </p>
      </section>
    </div>
  );
}
