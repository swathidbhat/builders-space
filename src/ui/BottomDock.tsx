import { useEffect, useState, type CSSProperties } from 'react';
import { useSpaceStore } from '../store';
import { AssistantNotice } from './AssistantNotice';
import { HookSetupCard } from './HookSetupCard';
import { StatusLegend } from './StatusLegend';
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

  if (left + right > vw - 180) right = Math.max(16, vw - left - 180);

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

/**
 * One bottom edge for the legend, notices, the disconnect banner, and hooks.
 * It sits in the rectangle left by the project list and the detail sheet.
 */
export function BottomDock() {
  const connection = useSpaceStore((s) => s.connection);
  const panelOpen = useSpaceStore((s) => s.selectedPlanetId !== null);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const [insets, setInsets] = useState<DockInsets>(REST);

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

  const style = {
    left: insets.left,
    right: insets.right,
    bottom: insets.bottom,
    maxHeight: insets.maxHeight,
  } as CSSProperties;

  return (
    <div className={styles.dock} data-bottom-dock="" data-overlay="dock" style={style}>
      {connection === 'stale' && (
        <div className={styles.banner} role="status" data-overlay="disconnect">
          {DISCONNECT_BANNER}
        </div>
      )}
      <AssistantNotice />
      <div className={styles.row}>
        <StatusLegend />
        <HookSetupCard />
      </div>
    </div>
  );
}
