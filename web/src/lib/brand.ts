import type { CSSProperties } from 'react';

type Rgb = readonly [number, number, number];

const DARK_INK = '#1f1915';
const LIGHT_INK = '#ffffff';
const DEFAULT_BRAND = '#b5482a';

export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour for a brand fill: white or near-black, whichever reads better. */
export function inkFor(brand: Rgb): string {
  const white = parseHex(LIGHT_INK)!;
  const dark = parseHex(DARK_INK)!;
  return contrastRatio(brand, white) >= contrastRatio(brand, dark) ? LIGHT_INK : DARK_INK;
}

/** The brand as text on a light page, darkened until it reaches 4.5:1 so pale brands stay readable. */
export function brandTextFor(brand: Rgb, page: Rgb = [251, 247, 242]): string {
  let colour: Rgb = brand;
  for (let i = 0; i < 20 && contrastRatio(colour, page) < 4.5; i++) {
    colour = [colour[0] * 0.9, colour[1] * 0.9, colour[2] * 0.9];
  }
  return toHex(colour);
}

/** CSS variables that theme a subtree with a venue's brand colour. */
export function brandStyle(hex: string): CSSProperties {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_BRAND)!;
  return {
    '--brand': toHex(rgb),
    '--brand-ink': inkFor(rgb),
    '--brand-text': brandTextFor(rgb),
  } as CSSProperties;
}
