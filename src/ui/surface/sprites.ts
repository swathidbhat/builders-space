export const SCALE = 2;
export const PX_W = 100;
export const PX_H = 60;
export const GROUND_MIN = 8;

export type PlanetType = 'gasGiant' | 'rocky' | 'oceanic' | 'volcanic' | 'ice';
export const PLANET_TYPES: PlanetType[] = ['gasGiant', 'rocky', 'oceanic', 'volcanic', 'ice'];

export const STATUS_Z: Record<string, number> = { working: 0, waiting: 1, error: 2 };

export const TERRAIN_PAL: Record<PlanetType, { hi: string; mid: string; lo: string }> = {
  rocky: { hi: '#7a6a5a', mid: '#5a4a3a', lo: '#3a3228' },
  oceanic: { hi: '#3a7a8a', mid: '#2a5a6a', lo: '#1a3a4a' },
  volcanic: { hi: '#7a3a2a', mid: '#4a2a2a', lo: '#2a1a1a' },
  ice: { hi: '#7a8a9a', mid: '#5a6a7a', lo: '#3a4a5a' },
  gasGiant: { hi: '#7a6a4a', mid: '#5a4a2a', lo: '#3a2a18' },
};

export const SOURCE_CLR: Record<string, string> = {
  'claude-code': '#d97706',
  codex: '#10b981',
  cursor: '#6366f1',
};

export const SOURCE_CLR_DK: Record<string, string> = {
  'claude-code': '#9a5504',
  codex: '#087a52',
  cursor: '#4345a1',
};

export const STAND = [
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

export const DIG = [
  [
    '..hhh..p...',
    '.hhhhh.p...',
    '.seses.p...',
    '..sss......',
    '..ttt......',
    '.ttttt.....',
    '.ttttt.....',
    '..ttt......',
    '..l.l......',
    '..l.l......',
  ],
  [
    '..hhh......',
    '.hhhhh.....',
    '.seses.....',
    '..sss......',
    '..ttt......',
    '.tttttppp..',
    '.ttttt.....',
    '..ttt......',
    '..l.l......',
    '..l.l......',
  ],
  [
    '..hhh......',
    '.hhhhh.....',
    '.seses.....',
    '..sss......',
    '..ttt......',
    '.ttttt.....',
    '.ttttt.....',
    '..tttpp....',
    '..l.l.p....',
    '..l.l.d..d.',
  ],
  [
    '..hhh......',
    '.hhhhh.....',
    '.seses.....',
    '..sss......',
    '..ttt......',
    '.tttttppp..',
    '.ttttt.....',
    '..ttt......',
    '..l.l......',
    '..l.l......',
  ],
];

export const WALK = [
  [
    '..hhh..',
    '.hhhhh.',
    '.seses.',
    '..sss..',
    '..ttt..',
    '.ttttt.',
    '.ttttt.',
    '..ttt..',
    '.l...l.',
    '.l...l.',
  ],
  STAND,
  [
    '..hhh..',
    '.hhhhh.',
    '.seses.',
    '..sss..',
    '..ttt..',
    '.ttttt.',
    '.ttttt.',
    '..ttt..',
    '..ll...',
    '..ll...',
  ],
  STAND,
];

export const SIT = [
  '..hhh..',
  '.hhhhh.',
  '.seses.',
  '..sss..',
  '..ttt..',
  '.ttttt.',
  '.ltttl.',
  '..lll..',
];

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blit(
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
