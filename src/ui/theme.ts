import { CELL } from '../core/board';

export interface Theme {
  id: string;
  label: string;
  background: number;
  boardBg: number;
  gridLine: number;
  emptyCell: number;
  text: number;
  /** DOM surface colors (HUD chips, buttons, panels). */
  panelCss: string;
  edgeCss: string;
  shadowCss: string;
  /** Piece colors by color index 1..8. */
  colors: number[];
}

export const THEMES: Theme[] = [
  {
    id: 'night',
    label: 'Night',
    background: 0x10131a,
    boardBg: 0x181c26,
    gridLine: 0x232936,
    emptyCell: 0x1d2230,
    text: 0xe8ecf4,
    panelCss: '#151a26',
    edgeCss: 'rgba(255,255,255,0.07)',
    shadowCss: 'rgba(0,0,0,0.4)',
    colors: [0xffd166, 0x4cc9f0, 0x4895ef, 0x9b5de5, 0xf15bb5, 0x00bb88, 0xff7849, 0xef476f],
  },
  {
    id: 'paper',
    label: 'Paper',
    background: 0xf2ede4,
    boardBg: 0xe7dfd2,
    gridLine: 0xd5cab8,
    emptyCell: 0xded4c3,
    text: 0x3a3530,
    panelCss: '#fbf7ef',
    edgeCss: 'rgba(70,58,45,0.16)',
    shadowCss: 'rgba(98,82,64,0.4)',
    colors: [0xe0a000, 0x2a9d8f, 0x457b9d, 0x7b5ea7, 0xd16ba5, 0x2e9e5b, 0xe76f51, 0xc9485b],
  },
  {
    id: 'neon',
    label: 'Neon',
    background: 0x0c0218, // deep violet-black — clearly distinct from Night's blue
    boardBg: 0x190b33,
    gridLine: 0x321b66,
    emptyCell: 0x221045,
    text: 0xe9d5ff,
    panelCss: '#1d0e3d',
    edgeCss: 'rgba(190,140,255,0.18)',
    shadowCss: 'rgba(0,0,0,0.5)',
    colors: [0xfff95b, 0x00f5ff, 0x3d9bff, 0xbf5bff, 0xff4fd8, 0x39ff88, 0xff9e3d, 0xff3d6e],
  },
];

export const SPECIAL_COLORS: Record<number, number> = {
  [CELL.GEM]: 0x6ee7ff,
  [CELL.ICE]: 0xbfeaf7,
  [CELL.CRACKED]: 0x9fd4e8,
  [CELL.BOMB]: 0x3b3f4a,
  [CELL.STONE]: 0x8a8d96,
  [CELL.WILD]: 0xffffff,
};

export const SPECIAL_GLYPHS: Record<number, string> = {
  [CELL.GEM]: '💎',
  [CELL.ICE]: '🧊',
  [CELL.CRACKED]: '🧊',
  [CELL.BOMB]: '💣',
  [CELL.STONE]: '🪨',
  [CELL.WILD]: '🌈',
};

export function getTheme(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
