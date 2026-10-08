import { describe, expect, it } from 'vitest';
import { formatLek, formatLekDelta } from './money';

const nbsp = '\u00a0';

describe('formatLek', () => {
  it('shows whole lekë with an L suffix', () => {
    expect(formatLek(850)).toBe(`850${nbsp}L`);
    expect(formatLek(0)).toBe(`0${nbsp}L`);
  });

  it('follows Albanian grouping: four digits stay together, five or more are grouped', () => {
    expect(formatLek(1200)).toBe(`1200${nbsp}L`);
    expect(formatLek(12500)).toBe(`12${nbsp}500${nbsp}L`);
    expect(formatLek(1234567)).toBe(`1${nbsp}234${nbsp}567${nbsp}L`);
  });

  it('never uses a comma, which Albanian reads as a decimal mark', () => {
    for (const amount of [999, 2300, 45000, 1000000]) expect(formatLek(amount)).not.toContain(',');
  });
});

describe('formatLekDelta', () => {
  it('signs option price changes and hides zero', () => {
    expect(formatLekDelta(150)).toBe(`+150${nbsp}L`);
    expect(formatLekDelta(-50)).toBe(`\u221250${nbsp}L`);
    expect(formatLekDelta(0)).toBe('');
  });
});
