import { describe, expect, it } from 'vitest';
import { brandStyle, brandTextFor, contrastRatio, inkFor, parseHex } from './brand';

describe('brand theming', () => {
  it('puts white text on dark brands and dark text on pale ones', () => {
    expect(inkFor(parseHex('#b5482a')!)).toBe('#ffffff'); // terracotta
    expect(inkFor(parseHex('#1f5e45')!)).toBe('#ffffff'); // deep green
    expect(inkFor(parseHex('#f2c94c')!)).toBe('#1f1915'); // mustard
  });

  it('darkens a pale brand until it is readable as text', () => {
    const page = parseHex('#fbf7f2')!;
    const text = parseHex(brandTextFor(parseHex('#f2c94c')!))!;
    expect(contrastRatio(text, page)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a brand that is already readable', () => {
    expect(brandTextFor(parseHex('#1f5e45')!)).toBe('#1f5e45');
  });

  it('falls back to the default brand for an invalid colour', () => {
    expect(brandStyle('not-a-colour')).toMatchObject({ '--brand': '#b5482a' });
  });
});
