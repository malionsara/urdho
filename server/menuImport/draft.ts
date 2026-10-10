import { ALLERGENS } from '../../shared/allergens';
import { formatLek } from '../../shared/money';
import { menuImportInput, type MenuImportInput } from '../../shared/schemas';
import { ITEM_TAGS, type LocalizedText } from '../../shared/types';

/*
 * A menu as Claude reads it from a restaurant's photos, PDF or web page (the "draft"), and how it
 * becomes an import: prices turned into whole lekë, dishes without a price set aside, choices
 * made consistent, and the result checked against the same rules as the dashboard's menu editor.
 */

export interface DraftText {
  sq: string;
  en: string;
}

export interface DraftItem {
  name: DraftText;
  description: DraftText;
  /** In the menu's currency, as printed; null when the menu shows none or it can't be read. */
  price: number | null;
  tags: string[];
  allergens: string[];
  optionGroups: { name: DraftText; minSelect: number; maxSelect: number; options: { name: DraftText; priceDelta: number | null }[] }[];
}

export interface MenuDraft {
  currency: 'ALL' | 'EUR' | 'other';
  categories: { name: DraftText; items: DraftItem[] }[];
  /** Notes for the team: unreadable prices, cut-off photos, a service charge. */
  warnings: string[];
}

const text = (description: string) => ({
  type: 'object',
  description,
  properties: { sq: { type: 'string' }, en: { type: 'string' } },
  required: ['sq', 'en'],
});

/** The JSON schema Claude fills in (the save_menu tool's input). */
export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    currency: { type: 'string', enum: ['ALL', 'EUR', 'other'], description: 'Currency of the prices: ALL for lekë (L, Lek, Lekë, ALL), EUR for €.' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: text('Category name in Albanian and English.'),
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: text('Dish or drink name.'),
                description: text('Description as printed on the menu, translated; empty strings when the menu has none.'),
                price: { type: ['number', 'null'], description: 'Price as printed, a plain number in the menu currency; null if missing or unreadable.' },
                tags: { type: 'array', items: { type: 'string', enum: [...ITEM_TAGS] }, description: 'Only when the menu marks it.' },
                allergens: { type: 'array', items: { type: 'string', enum: [...ALLERGENS] }, description: 'Only allergens the menu itself marks for this dish.' },
                optionGroups: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: text('What the guest chooses, e.g. Size, Portion, Extras.'),
                      minSelect: { type: 'integer', minimum: 0 },
                      maxSelect: { type: 'integer', minimum: 1 },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: text('Option name.'),
                            priceDelta: { type: ['number', 'null'], description: 'Price added to the dish price, in the menu currency; 0 for none.' },
                          },
                          required: ['name', 'priceDelta'],
                        },
                      },
                    },
                    required: ['name', 'minSelect', 'maxSelect', 'options'],
                  },
                },
              },
              required: ['name', 'description', 'price', 'tags', 'allergens', 'optionGroups'],
            },
          },
        },
        required: ['name', 'items'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Short notes for the team, in English; empty if none.' },
  },
  required: ['currency', 'categories', 'warnings'],
} as const;

/* From draft to import ------------------------------------------------------ */

export interface ImportPlan {
  input: MenuImportInput;
  /** Dishes left out, with why ("Mains / Peshk i ditës: no price on the menu"). */
  skipped: string[];
}

export class DraftError extends Error {}

const LIMITS = { category: 60, name: 120, description: 500, option: 80 };

function localized(value: Partial<DraftText> | undefined, max: number): LocalizedText {
  const out: LocalizedText = {};
  for (const lang of ['sq', 'en'] as const) {
    const t = value?.[lang]?.trim();
    if (t) out[lang] = t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
  return out;
}

const label = (t: Partial<DraftText> | undefined) => t?.sq?.trim() || t?.en?.trim() || '(no name)';

/**
 * Turns a draft into an import. Prices in euro need `eurRate` (lekë per euro); any other currency
 * is refused. Throws DraftError with every problem found.
 */
export function planImport(draft: MenuDraft, { eurRate, visible = false }: { eurRate?: number; visible?: boolean } = {}): ImportPlan {
  if (draft.currency === 'other') throw new DraftError('The menu is priced in a currency other than lekë or euro; convert it by hand.');
  if (draft.currency === 'EUR' && !(eurRate && eurRate > 0)) throw new DraftError('The menu is priced in euro: add --eur-rate (lekë per euro, e.g. --eur-rate 100).');
  const rate = draft.currency === 'EUR' ? eurRate! : 1;
  const lek = (n: number) => Math.round(n * rate);

  const skipped: string[] = [];
  const categories: MenuImportInput['categories'] = [];
  for (const category of draft.categories ?? []) {
    const items = [];
    for (const item of category.items ?? []) {
      const where = `${label(category.name)} / ${label(item.name)}`;
      if (item.price === null || item.price === undefined || !(item.price > 0)) {
        skipped.push(`${where}: no price on the menu`);
        continue;
      }
      const name = localized(item.name, LIMITS.name);
      if (Object.keys(name).length === 0) {
        skipped.push(`${where}: no name`);
        continue;
      }
      const optionGroups = (item.optionGroups ?? [])
        .map((group) => {
          const options = (group.options ?? [])
            .map((o) => ({ name: localized(o.name, LIMITS.option), priceDeltaLek: lek(o.priceDelta ?? 0), available: true }))
            .filter((o) => Object.keys(o.name).length > 0)
            .slice(0, 30);
          const maxSelect = Math.min(Math.max(1, Math.round(group.maxSelect ?? 1)), options.length);
          const minSelect = Math.min(Math.max(0, Math.round(group.minSelect ?? 0)), maxSelect);
          return { name: localized(group.name, LIMITS.option), minSelect, maxSelect, options };
        })
        .filter((g) => g.options.length > 0 && Object.keys(g.name).length > 0)
        .slice(0, 10);
      items.push({
        name,
        description: localized(item.description, LIMITS.description),
        priceLek: lek(item.price),
        photoUrl: null,
        available: true,
        suggestInBasket: false,
        tags: [...new Set(item.tags ?? [])].filter((t): t is (typeof ITEM_TAGS)[number] => (ITEM_TAGS as readonly string[]).includes(t)),
        allergens: [...new Set(item.allergens ?? [])].filter((a): a is (typeof ALLERGENS)[number] => (ALLERGENS as readonly string[]).includes(a)),
        optionGroups,
      });
    }
    if (items.length > 0) categories.push({ name: localized(category.name, LIMITS.category), items });
  }
  if (categories.length === 0) throw new DraftError('No dishes with a price were found.');

  const parsed = menuImportInput.safeParse({ visible, categories });
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 10).map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new DraftError(`The draft doesn't fit the menu rules:\n${problems.join('\n')}`);
  }
  return { input: parsed.data, skipped };
}

/* A readable copy for checking ---------------------------------------------- */

const NBSP = String.fromCharCode(0xa0);
const price = (n: number) => formatLek(n).split(NBSP).join(' ');
const both = (t: LocalizedText) => [t.sq, t.en].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(' · ');

/** The menu as it will appear, for a person to check before it goes in. */
export function previewText(plan: ImportPlan, warnings: string[]): string {
  const lines: string[] = [];
  for (const category of plan.input.categories) {
    lines.push(`${both(category.name)} (${category.items.length})`);
    for (const item of category.items) {
      lines.push(`  ${both(item.name).padEnd(56, ' ')} ${price(item.priceLek)}`);
      const description = both(item.description);
      if (description) lines.push(`      ${description}`);
      for (const group of item.optionGroups) {
        const rule = group.minSelect > 0 ? 'choose' : 'optional';
        const options = group.options.map((o) => `${both(o.name)}${o.priceDeltaLek ? ` ${o.priceDeltaLek > 0 ? '+' : ''}${price(o.priceDeltaLek)}` : ''}`);
        lines.push(`      ${both(group.name)} (${rule}): ${options.join(', ')}`);
      }
      const marks = [...item.tags, ...item.allergens.map((a) => `allergen: ${a}`)];
      if (marks.length) lines.push(`      ${marks.join(', ')}`);
    }
    lines.push('');
  }
  if (plan.skipped.length) lines.push('Left out:', ...plan.skipped.map((s) => `  - ${s}`), '');
  if (warnings.length) lines.push('Notes from reading the menu:', ...warnings.map((w) => `  - ${w}`), '');
  return lines.join('\n');
}
