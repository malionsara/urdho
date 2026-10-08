import type { MenuItem, MenuOptionGroup } from './types';

/** Price of one unit of an item with the chosen options, in whole lekë. */
export function unitPriceLek(item: MenuItem, optionIds: readonly string[]): number {
  let total = item.priceLek;
  for (const group of item.optionGroups) {
    for (const option of group.options) {
      if (optionIds.includes(option.id)) total += option.priceDeltaLek;
    }
  }
  return total;
}

export function lineTotalLek(item: MenuItem, optionIds: readonly string[], qty: number): number {
  return unitPriceLek(item, optionIds) * qty;
}

export interface SelectionProblem {
  groupId: string;
  kind: 'too-few' | 'too-many' | 'unavailable';
}

/** Checks chosen options against each group's min and max. Unknown option IDs are ignored. */
export function checkSelection(
  groups: readonly MenuOptionGroup[],
  optionIds: readonly string[],
): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  for (const group of groups) {
    const chosen = group.options.filter((o) => optionIds.includes(o.id));
    if (chosen.some((o) => !o.available)) problems.push({ groupId: group.id, kind: 'unavailable' });
    if (chosen.length < group.minSelect) problems.push({ groupId: group.id, kind: 'too-few' });
    if (chosen.length > group.maxSelect) problems.push({ groupId: group.id, kind: 'too-many' });
  }
  return problems;
}

/** Options picked before the guest touches anything: the first available one in each required single choice. */
export function defaultOptionIds(item: MenuItem): string[] {
  return item.optionGroups
    .filter((g) => g.minSelect === 1 && g.maxSelect === 1)
    .map((g) => g.options.find((o) => o.available)?.id)
    .filter((id): id is string => id !== undefined);
}
