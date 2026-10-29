// The game's colors in one place, so the art pass can retune them without hunting.
import type { Surface } from '../sim/world';

export const SURFACE_COLOR: Record<Surface, string> = {
  fairway: '#82b55a',
  green: '#8cc163',
  rough: '#62973f',
  bramble: '#4d7b37',
  path: '#b9a888',
  tee: '#bdbab1',
};

export const COLORS = {
  asphalt: '#5a5f63',
  obLawn: '#6e9a52',
  trunk: '#6d5440',
  leafy: ['#4f8a3c', '#5c9844', '#447d36', '#6aa24b'],
  young: ['#7cb352', '#88bd5a', '#6fa647'],
  fir: ['#2f5e3b', '#36693f', '#2a5434'],
  bush: ['#42723a', '#4b7f3e', '#3a6634'],
  basketMetal: '#c9ced3',
  basketBand: '#f2c230',
  chain: '#aeb5bb',
  shirt: '#2f7de1',
  skin: '#e2b48f',
  shorts: '#8c8f93',
  obStake: '#f4f4f0',
  preview: '#ffffff',
};
