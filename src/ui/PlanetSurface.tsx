import { useRef, useEffect, useMemo } from 'react';
import type { AgentInfo } from '../types';
import type { AgentIdentity } from './agentIdentity';

const SCALE = 2;
const PX_W = 100;
const PX_H = 60;
const GROUND_MIN = 8;

type PlanetType = 'gasGiant' | 'rocky' | 'oceanic' | 'volcanic' | 'ice';
const PLANET_TYPES: PlanetType[] = ['gasGiant', 'rocky', 'oceanic', 'volcanic', 'ice'];

const STATUS_Z: Record<string, number> = { working: 0, waiting: 1, error: 2 };

const TERRAIN_PAL: Record<PlanetType, { hi: string; mid: string; lo: string }> = {
  rocky:    { hi: '#7a6a5a', mid: '#5a4a3a', lo: '#3a3228' },
  oceanic:  { hi: '#3a7a8a', mid: '#2a5a6a', lo: '#1a3a4a' },
  volcanic: { hi: '#7a3a2a', mid: '#4a2a2a', lo: '#2a1a1a' },
  ice:      { hi: '#7a8a9a', mid: '#5a6a7a', lo: '#3a4a5a' },
  gasGiant: { hi: '#7a6a4a', mid: '#5a4a2a', lo: '#3a2a18' },
};

const SOURCE_CLR: Record<string, string> = {
  'claude-code': '#d97706',
  codex: '#10b981',
  cursor: '#6366f1',
};

const SOURCE_CLR_DK: Record<string, string> = {
  'claude-code': '#9a5504',
  codex: '#087a52',
  cursor: '#4345a1',
};

const STAND = [
  '..hhh..',
  '.hhhhh.',
  '.seses.',
  '..sss..',
  '..ttt..',
  '.ttttt.',
  '.ttttt.',
  '..ttt..',
  '..l.l..',
  '..l.l..',
];

const DIG = [
  ['..hhh..p...', '.hhhhh.p...', '.seses.p...', '..sss......', '..ttt......', '.ttttt.....', '.ttttt.....', '..ttt......', '..l.l......', '..l.l......'],
  ['..hhh......', '.hhhhh.....', '.seses.....', '..sss......', '..ttt......', '.tttttppp..', '.ttttt.....', '..ttt......', '..l.l......', '..l.l......'],
  ['..hhh......', '.hhhhh.....', '.seses.....', '..sss......', '..ttt......', '.ttttt.....', '.ttttt.....', '..tttpp....', '..l.l.p....', '..l.l.d..d.'],
  ['..hhh......', '.hhhhh.....', '.seses.....', '..sss......', '..ttt......', '.tttttppp..', '.ttttt.....', '..ttt......', '..l.l......', '..l.l......'],
];

const WALK = [
  ['..hhh..', '.hhhhh.', '.seses.', '..sss..', '..ttt..', '.ttttt.', '.ttttt.', '..ttt..', '.l...l.', '.l...l.'],
  STAND,
  ['..hhh..', '.hhhhh.', '.seses.', '..sss..', '..ttt..', '.ttttt.', '.ttttt.', '..ttt..', '..ll...', '..ll...'],
  STAND,
];

const SIT = [
  '..hhh..',
  '.hhhhh.',
  '.seses.',
  '..sss..',
  '..ttt..',
  '.ttttt.',
  '.ltttl.',
  '..lll..',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blit(
  ctx: CanvasRenderingContext2D,
  sprite: string[],
  x: number,
  y: number,
  pal: Record<string, string>,
  flip = false,
) {
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    const w = row.length;
    for (let c = 0; c < w; c++) {
      const ch = row[flip ? w - 1 - c : c];
      if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect((x + c) | 0, (y + r) | 0, 1, 1);
    }
  }
}

interface Props {
  agents: AgentInfo[];
  projectName: string;
  identities: Map<string, AgentIdentity>;
}

export function PlanetSurface({ agents, projectName, identities }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);

  const pType = useMemo<PlanetType>(
    () => PLANET_TYPES[hash(projectName) % PLANET_TYPES.length],
    [projectName],
  );

  const visible = useMemo(
    () => agents.filter(a => a.status === 'working' || a.status === 'error' || a.status === 'waiting'),
    [agents],
  );

  const heights = useMemo(() => {
    const r = prng(hash(projectName + '_t'));
    const h: number[] = [];
    for (let x = 0; x < PX_W; x++) h.push(GROUND_MIN + ((r() * 4) | 0));
    for (let p = 0; p < 3; p++)
      for (let i = 1; i < h.length - 1; i++)
        h[i] = ((h[i - 1] + h[i] + h[i + 1] + 1) / 3) | 0;
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
      y: (PX_H - GROUND_MIN - 16) + r() * 10,
      speed: 0.04 + r() * 0.08,
      drift: r() * Math.PI * 2,
      brightness: 0.06 + r() * 0.1,
    }));
  }, [projectName]);

  const anims = useMemo(
    () =>
      visible.map((a, i) => {
        if (a.status === 'working') {
          const maxR = Math.max(3, ((PX_W / (visible.length + 1)) / 2 - 5) | 0);
          return { kind: (i % 3 === 0 ? 'walk' : 'dig') as 'walk' | 'dig', range: Math.min(10, maxR) };
        }
        if (a.status === 'error') return { kind: 'shake' as const, range: 0 };
        return { kind: 'rest' as const, range: 0 };
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
    const ctx = cvs.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    const loop = () => {
      const f = ++frameRef.current;
      ctx.clearRect(0, 0, PX_W, PX_H);

      /* ── Sky ── */
      const sky = ctx.createLinearGradient(0, 0, 0, PX_H);
      sky.addColorStop(0, '#050510');
      sky.addColorStop(0.65, '#0a0a1a');
      sky.addColorStop(1, '#0e0e22');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, PX_W, PX_H);

      /* ── Stars ── */
      for (const s of stars) {
        const a = Math.max(0.05, Math.min(1, s.b + Math.sin(f * 0.015 + s.x) * 0.25));
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fillRect(s.x, s.y, 1, 1);
      }

      /* ── Dust motes ── */
      for (const m of dustMotes) {
        const mx = (m.x + f * m.speed) % PX_W;
        const my = m.y + Math.sin(f * 0.02 + m.drift) * 2;
        const ma = m.brightness + Math.sin(f * 0.01 + m.drift) * 0.05;
        ctx.fillStyle = `rgba(200,190,170,${Math.max(0, ma).toFixed(2)})`;
        ctx.fillRect(mx | 0, my | 0, 1, 1);
      }

      /* ── Terrain ── */
      const tp = TERRAIN_PAL[pType];
      for (let x = 0; x < PX_W; x++) {
        const h = heights[x];
        const top = PX_H - h;
        ctx.fillStyle = tp.hi;
        ctx.fillRect(x, top, 1, 2);
        ctx.fillStyle = tp.mid;
        ctx.fillRect(x, top + 2, 1, h - 3);
        ctx.fillStyle = tp.lo;
        ctx.fillRect(x, PX_H - 1, 1, 1);
      }

      /* ── Agents (working behind, error in front) ── */
      const gap = PX_W / (visible.length + 1);
      const df = ((f / 15) | 0) % 4;
      const wf = ((f / 10) | 0) % 4;

      for (const i of drawOrder) {
        const agent = visible[i];
        const anim = anims[i];
        const bx = (gap * (i + 1)) | 0;
        const identity = identities.get(agent.id);

        let sp: string[];
        let xOff = 0;
        let flip = false;

        switch (anim.kind) {
          case 'dig':
            sp = DIG[df];
            flip = i % 2 === 1;
            break;
          case 'walk': {
            sp = WALK[wf];
            const phase = Math.sin(f * 0.025 + i * 2);
            xOff = Math.round(phase * anim.range);
            flip = phase < 0;
            break;
          }
          case 'shake': {
            sp = STAND;
            xOff = Math.round(Math.sin(f * 0.3 + i * 5) * 1.5);
            const stumble = (f + i * 31) % 70;
            if (stumble < 6) xOff += Math.round(Math.sin(stumble * 0.9) * 2);
            break;
          }
          case 'rest':
            sp = SIT;
            flip = ((f + i * 73) % 300) > 260;
            break;
        }

        const finalX = bx + xOff;
        const sampleX = Math.max(0, Math.min(finalX, PX_W - 1));
        const gTop = PX_H - heights[sampleX];

        const blinkCycle = (f + i * 47) % 150;
        const isBlinking = blinkCycle >= 143;
        const skinClr = identity?.skinColor || '#e8b88a';

        const pal: Record<string, string> = {
          h: identity?.hairColor || '#4a3728',
          s: skinClr,
          e: isBlinking ? skinClr : '#2a2a2a',
          t: identity?.suitColor || SOURCE_CLR[agent.source] || '#888',
          l: identity?.suitColorDark || SOURCE_CLR_DK[agent.source] || '#555',
          p: '#888',
          d: tp.hi,
        };

        if (agent.status === 'error') {
          pal.e = isBlinking ? skinClr : '#ff3333';
          const glitch = (f + i * 17) % 35;
          if (glitch < 3) {
            pal.t = '#993333';
            pal.l = '#662222';
          }
        }

        let breathDy: number;
        if (anim.kind === 'shake') {
          breathDy = Math.round(Math.sin(f * 0.15 + i * 3) * 0.7);
        } else if (anim.kind === 'rest') {
          breathDy = Math.round(Math.sin(f * 0.015 + i * 2.7) * 0.4);
        } else {
          breathDy = Math.round(Math.sin(f * 0.025 + i * 2.7) * 0.55);
        }

        const dx = finalX - 3;
        const dy = gTop - sp.length + breathDy;

        const shadowW = sp[0].length - 2;
        const shadowAlpha = 0.12 + Math.sin(f * 0.015 + i * 2.7) * 0.03;
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(2)})`;
        ctx.fillRect(dx + 1, gTop, shadowW, 1);

        blit(ctx, sp, dx, dy, pal, flip);

        /* ── ERROR effects: embers, "!" beacon, red ground glow ── */
        if (agent.status === 'error') {
          const rga = 0.18 + Math.sin(f * 0.1 + i) * 0.1;
          ctx.fillStyle = `rgba(255,60,60,${rga.toFixed(2)})`;
          for (let gx = -2; gx <= sp[0].length + 1; gx++) {
            ctx.fillRect(dx + gx, gTop, 1, 1);
          }
          ctx.fillStyle = `rgba(255,60,60,${(rga * 0.4).toFixed(2)})`;
          ctx.fillRect(dx - 3, gTop, 1, 1);
          ctx.fillRect(dx + sp[0].length + 2, gTop, 1, 1);

          for (let p = 0; p < 5; p++) {
            const cycle = 55;
            const t = ((f + p * 11 + i * 7) % cycle) / cycle;
            if (t < 0.8) {
              const ex = dx + 1 + (p % (sp[0].length - 1)) + Math.sin(t * 5 + p) * 1.5;
              const ey = gTop - t * 16;
              const ea = (1 - t * 1.2) * 0.6;
              if (ea > 0) {
                ctx.fillStyle = p % 2 === 0
                  ? `rgba(255,130,40,${ea.toFixed(2)})`
                  : `rgba(255,55,35,${ea.toFixed(2)})`;
                ctx.fillRect(ex | 0, ey | 0, 1, 1);
              }
            }
          }

          const pulse = Math.max(0, Math.min(1, 0.4 + Math.sin(f * 0.08 + i) * 0.55));
          ctx.fillStyle = `rgba(255,50,50,${pulse.toFixed(2)})`;
          ctx.fillRect(dx + 3, dy - 7, 1, 1);
          ctx.fillRect(dx + 3, dy - 6, 1, 1);
          ctx.fillStyle = `rgba(255,50,50,${(pulse * 0.85).toFixed(2)})`;
          ctx.fillRect(dx + 3, dy - 4, 1, 1);

          const spark = (f + i * 41) % 100;
          if (spark < 2) {
            ctx.fillStyle = 'rgba(255,255,200,0.7)';
            ctx.fillRect(dx + (spark === 0 ? 1 : 5), dy + 3, 1, 1);
          }
        }

        /* ── WORKING effects: dust trail, dig debris ── */
        if (agent.status === 'working') {
          if (anim.kind === 'walk') {
            const walkVel = Math.cos(f * 0.025 + i * 2);
            if (Math.abs(walkVel) > 0.25) {
              const movingRight = walkVel > 0;
              for (let p = 0; p < 3; p++) {
                const age = (f + p * 4) % 12;
                if (age < 8) {
                  const alpha = (1 - age / 8) * 0.25;
                  const behindX = movingRight ? dx - 1 : dx + sp[0].length;
                  const driftDir = movingRight ? -1 : 1;
                  const px = behindX + driftDir * ((age * 0.4) | 0);
                  const py = gTop - 1 - ((age * 0.3) | 0);
                  ctx.fillStyle = `rgba(180,165,140,${alpha.toFixed(2)})`;
                  ctx.fillRect(px | 0, py | 0, 1, 1);
                }
              }
            }
          }

          if (anim.kind === 'dig' && df === 2) {
            const subF = f % 15;
            const dir = flip ? -1 : 1;
            const ox = flip ? dx : dx + sp[0].length - 1;

            if (subF < 4) {
              const sparkA = (1 - subF / 4) * 0.7;
              ctx.fillStyle = '#fff';
              ctx.globalAlpha = sparkA;
              ctx.fillRect(ox, gTop - 2, 1, 1);
              if (subF < 2) ctx.fillRect(ox + dir, gTop - 1, 1, 1);
              ctx.globalAlpha = 1;
            }

            for (let p = 0; p < 4; p++) {
              const t = subF / 14;
              const vx = dir * (0.2 + p * 0.12);
              const vy = -(0.5 + p * 0.18);
              const px = ox + vx * subF;
              const py = gTop - 1 + vy * subF + 0.03 * subF * subF;
              const alpha = (1 - t) * 0.5;
              if (alpha > 0.02 && py < gTop) {
                ctx.fillStyle = p % 2 === 0 ? tp.hi : tp.mid;
                ctx.globalAlpha = alpha;
                ctx.fillRect(px | 0, py | 0, 1, 1);
                ctx.globalAlpha = 1;
              }
            }
          }
        }

        /* ── WAITING effects: "..." thought bubble ── */
        if (agent.status === 'waiting') {
          const dotCycle = (f + i * 30) % 100;
          const activeDot = dotCycle < 75 ? Math.floor(dotCycle / 25) : -1;

          const bubbleY = dy - 8;
          const bubbleX = dx + 1;

          ctx.fillStyle = 'rgba(255,200,100,0.07)';
          ctx.fillRect(bubbleX, bubbleY, 5, 3);
          ctx.fillStyle = 'rgba(255,200,100,0.12)';
          ctx.fillRect(bubbleX - 1, bubbleY + 1, 1, 1);
          ctx.fillRect(bubbleX + 5, bubbleY + 1, 1, 1);
          ctx.fillRect(bubbleX + 1, bubbleY - 1, 3, 1);
          ctx.fillRect(bubbleX + 2, bubbleY + 3, 1, 1);

          for (let d = 0; d < 3; d++) {
            const isActive = d === activeDot;
            const dotAlpha = isActive ? 0.9 : 0.18;
            const dotY = bubbleY + 1 + (isActive ? -1 : 0);
            ctx.fillStyle = `rgba(255,180,60,${dotAlpha.toFixed(2)})`;
            ctx.fillRect(bubbleX + d * 2, dotY | 0, 1, 1);
          }
        }

        /* ── Helmet glint ── */
        const glintCycle = (f + i * 73) % 200;
        if (glintCycle >= 195 && glintCycle <= 197) {
          const gx = dx + (flip ? 1 : 4);
          const gy = dy + 2;
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(gx, gy, 1, 1);
        }

        /* ── Identity pulse dot ── */
        if (identity) {
          const pulse = 0.6 + Math.sin(f * 0.03 + i * 1.5) * 0.3;
          ctx.fillStyle = identity.gradient[0];
          ctx.globalAlpha = pulse;
          ctx.fillRect(dx + 3, dy - 2, 1, 1);
          ctx.globalAlpha = 1;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, anims, drawOrder, pType, heights, stars, dustMotes, identities]);

  return (
    <canvas
      ref={canvasRef}
      width={PX_W * SCALE}
      height={PX_H * SCALE}
      style={{
        width: '100%',
        aspectRatio: `${PX_W} / ${PX_H}`,
        borderRadius: '8px',
        imageRendering: 'pixelated',
        background: '#050510',
      }}
    />
  );
}
