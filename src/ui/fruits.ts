import { Assets, type Texture } from 'pixi.js';
// Noto Emoji PNGs (Apache 2.0, https://github.com/googlefonts/noto-emoji).
// Inlined as data URIs at build time so the offline/native builds carry them.
import apple from './sprites/apple.png';
import banana from './sprites/banana.png';
import grapes from './sprites/grapes.png';
import strawberry from './sprites/strawberry.png';
import watermelon from './sprites/watermelon.png';
import cherries from './sprites/cherries.png';
import pineapple from './sprites/pineapple.png';
import carrot from './sprites/carrot.png';
import broccoli from './sprites/broccoli.png';
import tomato from './sprites/tomato.png';

const URLS = [
  apple,
  banana,
  grapes,
  strawberry,
  watermelon,
  cherries,
  pineapple,
  carrot,
  broccoli,
  tomato,
];

let textures: Texture[] = [];

export async function loadFruitTextures(): Promise<void> {
  textures = await Promise.all(URLS.map((url) => Assets.load<Texture>(url)));
}

/**
 * Sprite for a block of `color` (1..8) at skin `stage`. Every line clear
 * advances the stage, rotating which fruit each color wears — the board's
 * look visibly evolves as you progress.
 */
export function fruitTexture(color: number, stage: number): Texture | null {
  if (textures.length === 0) return null;
  return textures[(color - 1 + stage) % textures.length];
}
