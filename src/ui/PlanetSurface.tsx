import { useEffect, useMemo, useRef } from 'react';
import { cssVars } from './cssVars';
import styles from './PlanetSurface.module.css';
import type { AgentInfo } from '../types';
import type { AgentIdentity } from './agentIdentity';
import { prefersReducedMotion } from '../reducedMotion';
import { MOTION_FRAME_MS, pageHidden, surfaceKeepsDrawing } from '../renderBudget';
import { drawSurfaceFrame, type SurfaceAnim } from './surface/drawSurface';
import {
  GROUND_MIN,
  PLANET_TYPES,
  PX_H,
  PX_W,
  SCALE,
  STATUS_Z,
  hash,
  prng,
} from './surface/sprites';

interface Props {
  agents: AgentInfo[];
  projectName: string;
  identities: Map<string, AgentIdentity>;
}

export function PlanetSurface({ agents, projectName, identities }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  const pType = useMemo(() => PLANET_TYPES[hash(projectName) % PLANET_TYPES.length], [projectName]);

  const visible = useMemo(
    () =>
      agents.filter(
        (a) => a.status === 'working' || a.status === 'error' || a.status === 'waiting',
      ),
    [agents],
  );

  const heights = useMemo(() => {
    const r = prng(hash(projectName + '_t'));
    const h: number[] = [];
    for (let x = 0; x < PX_W; x++) h.push(GROUND_MIN + ((r() * 4) | 0));
    for (let p = 0; p < 3; p++)
      for (let i = 1; i < h.length - 1; i++) h[i] = ((h[i - 1] + h[i] + h[i + 1] + 1) / 3) | 0;
    return h;
  }, [projectName]);

  const stars = useMemo(() => {
    const r = prng(hash(projectName + '_s'));
    return Array.from({ length: 30 }, () => ({
      x: (r() * PX_W) | 0,
      y: (r() * (PX_H - GROUND_MIN - 18)) | 0,
      b: 0.3 + r() * 0.7,
    }));
  }, [projectName]);

  const dustMotes = useMemo(() => {
    const r = prng(hash(projectName + '_dm'));
    return Array.from({ length: 5 }, () => ({
      x: r() * PX_W,
      y: PX_H - GROUND_MIN - 16 + r() * 10,
      speed: 0.04 + r() * 0.08,
      drift: r() * Math.PI * 2,
      brightness: 0.06 + r() * 0.1,
    }));
  }, [projectName]);

  const anims = useMemo(
    () =>
      visible.map((a, i): SurfaceAnim => {
        if (a.status === 'working') {
          const maxR = Math.max(3, (PX_W / (visible.length + 1) / 2 - 5) | 0);
          return {
            kind: i % 3 === 0 ? 'walk' : 'dig',
            range: Math.min(10, maxR),
          };
        }
        if (a.status === 'error') return { kind: 'shake', range: 0 };
        return { kind: 'rest', range: 0 };
      }),
    [visible],
  );

  const drawOrder = useMemo(
    () =>
      visible
        .map((_a, i) => i)
        .sort((a, b) => (STATUS_Z[visible[a].status] || 0) - (STATUS_Z[visible[b].status] || 0)),
    [visible],
  );

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    const scene = { pType, heights, stars, dustMotes, visible, anims, drawOrder, identities };
    let timer = 0;
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const paint = () => {
      if (pageHidden()) return;
      drawSurfaceFrame(ctx, ++frameRef.current, scene);
    };
    const sync = () => {
      stop();
      if (pageHidden()) return;
      paint();
      const kinds = anims.map((anim) => anim.kind);
      if (!surfaceKeepsDrawing(kinds, prefersReducedMotion(), false)) return;
      timer = window.setInterval(paint, MOTION_FRAME_MS);
    };
    const onVisibility = () => sync();
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    document.addEventListener('visibilitychange', onVisibility);
    media?.addEventListener('change', sync);
    sync();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      media?.removeEventListener('change', sync);
    };
  }, [visible, anims, drawOrder, pType, heights, stars, dustMotes, identities]);

  return (
    <canvas
      ref={canvasRef}
      width={PX_W * SCALE}
      height={PX_H * SCALE}
      className={styles.surface}
      style={cssVars({ '--aspect': `${PX_W} / ${PX_H}` })}
    />
  );
}
