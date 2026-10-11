import { useEffect, useState } from 'react';
import { API_ORIGIN, authHeaders } from '../api';
import { useSpaceStore } from '../store';
import styles from './AssistantNotice.module.css';

const DISMISS_KEY = 'builders-space:assistant-notice';

type NoticeKind = 'missing' | 'rejected';

const COPY: Record<NoticeKind, string> = {
  missing:
    'Human Lingo is using built-in wording. No Anthropic API key is set. The example value in .env.example is not a key — add a real one to .env if you want shorter labels.',
  rejected:
    'Anthropic rejected the API key (401). Human Lingo is using built-in wording until the key in .env is updated.',
};

function readDismissed(): NoticeKind | null {
  try {
    const value = localStorage.getItem(DISMISS_KEY);
    return value === 'missing' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
}

export function AssistantNotice() {
  const connection = useSpaceStore((s) => s.connection);
  const assistantRejected = useSpaceStore((s) => s.assistantRejected);
  const [serverKind, setServerKind] = useState<NoticeKind | null>(null);
  const [dismissed, setDismissed] = useState<NoticeKind | null>(readDismissed);

  useEffect(() => {
    if (connection !== 'live') return;
    const controller = new AbortController();
    fetch(`${API_ORIGIN}/api/health`, { headers: authHeaders(), signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('health failed'))))
      .then((data: { assistant?: string }) => {
        if (controller.signal.aborted) return;
        if (data.assistant === 'missing' || data.assistant === 'rejected') {
          setServerKind(data.assistant);
        } else {
          setServerKind(null);
        }
      })
      .catch(() => {
        /* the connection banner covers an unreachable server */
      });
    return () => controller.abort();
  }, [connection]);

  const kind: NoticeKind | null = assistantRejected ? 'rejected' : serverKind;
  if (!kind || dismissed === kind) return null;

  return (
    <aside className={styles.notice} role="status">
      <p>{COPY[kind]}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, kind);
          } catch {
            /* a private window can refuse storage; hiding it for this view is enough */
          }
          setDismissed(kind);
        }}
      >
        Dismiss
      </button>
    </aside>
  );
}
