import { describe, expect, it } from 'vitest';
import { checkSelection, defaultOptionIds, lineTotalLek, unitPriceLek } from './pricing';
import type { MenuItem } from './types';

const qofte: MenuItem = {
  id: 'qofte',
  categoryId: 'mains',
  name: { sq: 'Qofte' },
  description: {},
  priceLek: 600,
  photoUrl: null,
  available: true,
  suggestInBasket: false,
  tags: [],
  allergens: [],
  optionGroups: [
    {
      id: 'size',
      name: { sq: 'Sasia' },
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'six', name: { sq: '6 copë' }, priceDeltaLek: 0, available: true },
        { id: 'ten', name: { sq: '10 copë' }, priceDeltaLek: 350, available: true },
      ],
    },
    {
      id: 'extras',
      name: { sq: 'Shto' },
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'fries', name: { sq: 'Patate' }, priceDeltaLek: 200, available: true },
        { id: 'salad', name: { sq: 'Sallatë' }, priceDeltaLek: 150, available: false },
        { id: 'bread', name: { sq: 'Bukë' }, priceDeltaLek: 100, available: true },
      ],
    },
  ],
};

describe('pricing', () => {
  it('adds option price changes to the item price', () => {
    expect(unitPriceLek(qofte, ['six'])).toBe(600);
    expect(unitPriceLek(qofte, ['ten', 'fries'])).toBe(1150);
    expect(lineTotalLek(qofte, ['ten', 'fries'], 2)).toBe(2300);
  });

  it('ignores option IDs that do not belong to the item', () => {
    expect(unitPriceLek(qofte, ['six', 'someone-elses-option'])).toBe(600);
  });
});

describe('checkSelection', () => {
  it('accepts a valid selection', () => {
    expect(checkSelection(qofte.optionGroups, ['six', 'fries', 'bread'])).toEqual([]);
  });

  it('flags a missing required choice, too many extras and sold-out options', () => {
    expect(checkSelection(qofte.optionGroups, ['fries', 'bread', 'salad'])).toEqual([
      { groupId: 'size', kind: 'too-few' },
      { groupId: 'extras', kind: 'unavailable' },
      { groupId: 'extras', kind: 'too-many' },
    ]);
  });
});

describe('defaultOptionIds', () => {
  it('preselects the first available option of each required single choice', () => {
    expect(defaultOptionIds(qofte)).toEqual(['six']);
  });
});
