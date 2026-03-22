const AGENT_NAMES = [
  'Nova', 'Atlas', 'Comet', 'Pulsar', 'Nebula', 'Quasar', 'Orion', 'Vega',
  'Lyra', 'Titan', 'Astra', 'Cosmo', 'Stella', 'Zenith', 'Helix', 'Pixel',
  'Echo', 'Flux', 'Prism', 'Spark', 'Blaze', 'Drift', 'Ember', 'Frost',
  'Glyph', 'Halo', 'Ion', 'Jet', 'Kite', 'Lumen', 'Neon', 'Opal',
  'Phase', 'Rift', 'Sable', 'Tonic', 'Umbra', 'Volt', 'Warp', 'Zephyr',
];

const AVATAR_GRADIENTS: [string, string][] = [
  ['#ff6b6b', '#ee5a24'],
  ['#feca57', '#ff9f43'],
  ['#48dbfb', '#0abde3'],
  ['#ff9ff3', '#f368e0'],
  ['#54a0ff', '#2e86de'],
  ['#5f27cd', '#341f97'],
  ['#10ac84', '#01a3a4'],
  ['#ff6348', '#ff4757'],
  ['#2ed573', '#7bed9f'],
  ['#1e90ff', '#7b68ee'],
  ['#e056fd', '#be2edd'],
  ['#f0932b', '#eb4d4b'],
];

export const HAIR_COLORS = [
  '#4a3728',
  '#2a2a3a',
  '#8a5a3a',
  '#c4783e',
  '#e8c84a',
  '#5a3a5a',
  '#3a4a5a',
  '#8a3a3a',
];

const SKIN_TONES = [
  '#e8b88a',
  '#f5d0a9',
  '#d4a373',
  '#c89060',
  '#b07d56',
  '#8d5e3c',
];

export type AvatarShape = 'circle' | 'squircle' | 'rounded-square';
const AVATAR_SHAPES: AvatarShape[] = ['circle', 'squircle', 'rounded-square'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function darken(hex: string, amount = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount)).toString(16).padStart(2, '0');
  const dg = Math.round(g * (1 - amount)).toString(16).padStart(2, '0');
  const db = Math.round(b * (1 - amount)).toString(16).padStart(2, '0');
  return `#${dr}${dg}${db}`;
}

export interface AgentIdentity {
  name: string;
  initial: string;
  gradient: [string, string];
  hairColor: string;
  skinColor: string;
  suitColor: string;
  suitColorDark: string;
  avatarShape: AvatarShape;
  avatarBorderRadius: string;
}

export function getProjectAgentIdentities(agentIds: string[]): Map<string, AgentIdentity> {
  const map = new Map<string, AgentIdentity>();
  const usedNames = new Set<string>();
  const usedGradients = new Set<number>();
  const usedHair = new Set<number>();

  for (const id of agentIds) {
    let nameIdx = hash(id) % AGENT_NAMES.length;
    let attempts = 0;
    while (usedNames.has(AGENT_NAMES[nameIdx]) && attempts < AGENT_NAMES.length) {
      nameIdx = (nameIdx + 1) % AGENT_NAMES.length;
      attempts++;
    }
    const name = AGENT_NAMES[nameIdx];
    usedNames.add(name);

    let gradIdx = hash(id + '_g') % AVATAR_GRADIENTS.length;
    attempts = 0;
    while (usedGradients.has(gradIdx) && attempts < AVATAR_GRADIENTS.length) {
      gradIdx = (gradIdx + 1) % AVATAR_GRADIENTS.length;
      attempts++;
    }
    usedGradients.add(gradIdx);

    let hairIdx = hash(id + '_h') % HAIR_COLORS.length;
    attempts = 0;
    while (usedHair.has(hairIdx) && attempts < HAIR_COLORS.length) {
      hairIdx = (hairIdx + 1) % HAIR_COLORS.length;
      attempts++;
    }
    usedHair.add(hairIdx);

    const skinIdx = hash(id + '_s') % SKIN_TONES.length;
    const shapeIdx = hash(id + '_sh') % AVATAR_SHAPES.length;
    const shape = AVATAR_SHAPES[shapeIdx];

    const gradient = AVATAR_GRADIENTS[gradIdx];
    const suitColor = gradient[0];

    const borderRadius =
      shape === 'circle' ? '50%' :
      shape === 'squircle' ? '30%' : '6px';

    map.set(id, {
      name,
      initial: name[0],
      gradient,
      hairColor: HAIR_COLORS[hairIdx],
      skinColor: SKIN_TONES[skinIdx],
      suitColor,
      suitColorDark: darken(suitColor),
      avatarShape: shape,
      avatarBorderRadius: borderRadius,
    });
  }

  return map;
}
