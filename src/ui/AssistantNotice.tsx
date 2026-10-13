import { useEffect, useState } from 'react';
import { API_ORIGIN, authHeaders } from '../api';
import { useSpaceStore } from '../store';
import styles from './AssistantNotice.module.css';

const DISMISS_KEY = 'builders-space:assistant-notice';

type NoticeKind = 'missing' | 'rejected';

const COPY: Record<NoticeKind, string> = {
  missing:
    'Shorter labels are optional. Add an Anthropic key in .env if you want them. Without one, you still see the original text.',
  rejected:
    'The Anthropic key was rejected, so labels stay as written. Update the key in .env to try shorter labels again.',
};

function readDismissed(): NoticeKind | null {
  try {
    const value = localStorage.getItem(DISMISS_KEY);
    return value === 'missing' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
}

export function useAssistantNotice(): { kind: NoticeKind | null; dismiss: () => void } {
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
        if (
          data.assistant === 'missing' ||
          data.assistant === 'ready' ||
          data.assistant === 'rejected'
        ) {
          useSpaceStore.getState().applyAssistantKey(data.assistant);
        }
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
  const visible = kind !== null && dismissed !== kind;

  return {
    kind: visible ? kind : null,
    dismiss: () => {
      if (!kind) return;
      try {
        localStorage.setItem(DISMISS_KEY, kind);
      } catch {
        /* a private window can refuse storage; hiding it for this view is enough */
      }
      setDismissed(kind);
    },
  };
}

export function AssistantNoticeCopy({
  kind,
  onDismiss,
}: {
  kind: NoticeKind;
  onDismiss: () => void;
}) {
  return (
    <aside className={styles.notice} role="status">
      <p>{COPY[kind]}</p>
      <button type="button" className={styles.dismiss} onClick={onDismiss}>
        Dismiss
      </button>
    </aside>
  );
}

export function AssistantNotice() {
  const notice = useAssistantNotice();
  if (!notice.kind) return null;
  return <AssistantNoticeCopy kind={notice.kind} onDismiss={notice.dismiss} />;
}
