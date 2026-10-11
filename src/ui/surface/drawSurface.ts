import type { AgentInfo } from '../../types';
import type { AgentIdentity } from '../agentIdentity';
import {
  DIG,
  PX_H,
  PX_W,
  SIT,
  SOURCE_CLR,
  SOURCE_CLR_DK,
  STAND,
  TERRAIN_PAL,
  WALK,
  blit,
  type PlanetType,
} from './sprites';

export interface SurfaceStar {
  x: number;
  y: number;
  b: number;
}

export interface DustMote {
  x: number;
  y: number;
  speed: number;
  drift: number;
  brightness: number;
}

export interface SurfaceAnim {
  kind: 'walk' | 'dig' | 'shake' | 'rest';
  range: number;
}

export interface SurfaceScene {
  pType: PlanetType;
  heights: number[];
  stars: SurfaceStar[];
  dustMotes: DustMote[];
  visible: AgentInfo[];
  anims: SurfaceAnim[];
  drawOrder: number[];
  identities: Map<string, AgentIdentity>;
}

export function drawSurfaceFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  scene: SurfaceScene,
): void {
  const f = frame;
  const { stars, dustMotes, pType, heights, visible, anims, drawOrder, identities } = scene;
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
        flip = (f + i * 73) % 300 > 260;
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
            ctx.fillStyle =
              p % 2 === 0
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
}
