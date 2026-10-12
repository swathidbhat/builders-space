import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSpaceStore } from '../store';
import { AssistantNoticeCopy, useAssistantNotice } from './AssistantNotice';
import { HookSetupCard } from './HookSetupCard';
import { StatusLegend } from './StatusLegend';
import { formatAsOf } from './attention';
import { DISCONNECT_BANNER } from './skyCopy';
import styles from './BottomDock.module.css';

interface DockInsets {
  left: number;
  right: number;
  bottom: number;
  maxHeight: number;
}

const REST: DockInsets = { left: 16, right: 16, bottom: 16, maxHeight: 480 };

function readInsets(): DockInsets {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = 16;
  let right = 16;
  let bottom = 16;

  const nav = document.getElementById('projects-nav');
  if (nav) {
    const rect = nav.getBoundingClientRect();
    if (rect.width > 100 && rect.left < vw * 0.6 && rect.bottom > vh * 0.4) {
      left = Math.max(left, Math.round(rect.right) + 12);
    }
  }

  const panel = document.querySelector('aside[aria-label="Project details"]');
  if (panel instanceof HTMLElement) {
    const rect = panel.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 40) {
      const fromTop = rect.top < 48;
      const touchesBottom = rect.bottom > vh - 8;
      if (touchesBottom && !fromTop) bottom = Math.max(bottom, Math.round(vh - rect.top) + 12);
      else if (fromTop && rect.right > vw - 8 && rect.left > vw * 0.35) {
        right = Math.max(right, Math.round(vw - rect.left) + 12);
      }
    }
  }

  if (left + right > vw - 88) right = Math.max(16, vw - left - 88);

  const header = document.querySelector('header');
  const headerBottom = header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 72;
  const available = vh - bottom - headerBottom - 12;
  const labelReserve = 130;
  const maxHeight = Math.max(96, Math.min(200, Math.round(available - labelReserve)));
  return { left, right, bottom, maxHeight };
}

function sameInsets(a: DockInsets, b: DockInsets): boolean {
  return (
    a.left === b.left && a.right === b.right && a.bottom === b.bottom && a.maxHeight === b.maxHeight
  );
}

const WRENCH = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

/**
 * The bottom edge holds the disconnect banner and two menus.
 * Help explains the marks. Settings holds the API-key note and hooks.
 */
export function BottomDock() {
  const connection = useSpaceStore((s) => s.connection);
  const lastUpdated = useSpaceStore((s) => s.lastUpdated);
  const panelOpen = useSpaceStore((s) => s.selectedPlanetId !== null);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const notice = useAssistantNotice();
  const [insets, setInsets] = useState<DockInsets>(REST);
  const [menu, setMenu] = useState<'help' | 'settings' | null>(null);
  const menusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apply = () => {
      const next = readInsets();
      setInsets((current) => (sameInsets(current, next) ? current : next));
    };
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    const watch = () => {
      observer?.disconnect();
      const nav = document.getElementById('projects-nav');
      const panel = document.querySelector('aside[aria-label="Project details"]');
      const header = document.querySelector('header');
      if (nav) observer?.observe(nav);
      if (panel) observer?.observe(panel);
      if (header) observer?.observe(header);
    };
    watch();
    window.addEventListener('resize', apply);
    window.addEventListener('animationend', apply);
    const frame = window.requestAnimationFrame(apply);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', apply);
      window.removeEventListener('animationend', apply);
      observer?.disconnect();
    };
  }, [panelOpen, sidebarOpen]);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (!menusRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setMenu(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  const style = {
    left: insets.left,
    right: insets.right,
    bottom: insets.bottom,
    maxHeight: insets.maxHeight,
  } as CSSProperties;

  const toggle = (next: 'help' | 'settings') =>
    setMenu((current) => (current === next ? null : next));

  return (
    <div className={styles.dock} data-bottom-dock="" data-overlay="dock" style={style}>
      {connection === 'stale' && (
        <div className={styles.banner} role="status" data-overlay="disconnect">
          {DISCONNECT_BANNER}
          {lastUpdated > 0 ? `. Statuses ${formatAsOf(lastUpdated)}.` : ''}
        </div>
      )}
      <div className={styles.menus} ref={menusRef}>
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Status help"
            aria-expanded={menu === 'help'}
            data-overlay="help"
            onClick={() => toggle('help')}
          >
            ?
          </button>
          {menu === 'help' && (
            <div id="status-help" className={styles.popover}>
              <StatusLegend />
            </div>
          )}
        </div>
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={notice.kind ? 'Settings, needs attention' : 'Settings'}
            aria-expanded={menu === 'settings'}
            data-overlay="settings"
            data-attention={notice.kind ? 'true' : 'false'}
            onClick={() => toggle('settings')}
          >
            {WRENCH}
            {notice.kind && <span className={styles.attention} aria-hidden="true" />}
          </button>
          {menu === 'settings' && (
            <div id="sky-settings" className={`${styles.popover} ${styles.popoverPinned}`}>
              {notice.kind && <AssistantNoticeCopy kind={notice.kind} onDismiss={notice.dismiss} />}
              <HookSetupCard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
