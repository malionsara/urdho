import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CategoryInput, MenuItemInput } from '../../shared/schemas';
import type { LocalizedText, MenuItem } from '../../shared/types';
import type { Db } from '../db/client';
import { menuCategory, menuItem, menuOption, optionGroup } from '../db/schema';
import { ApiError, notFound } from '../http';
import { readTexts, writeTexts } from './translations';

/*
 * The menu: categories, dishes, option groups and options, each with texts per language.
 * Every function takes venueId first. Removing anything archives it (archived_at) so that past
 * orders, which point at dishes and options, always resolve.
 */

type Executor = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

export interface MenuCategoryRow {
  id: string;
  name: LocalizedText;
  active: boolean;
}

export interface Menu {
  categories: MenuCategoryRow[];
  items: MenuItem[];
}

/** The venue's live menu, in display order. With itemIds, only those dishes. */
export async function loadMenu(db: Executor, venueId: string, { itemIds }: { itemIds?: string[] } = {}): Promise<Menu> {
  const categories = await db
    .select({ id: menuCategory.id, active: menuCategory.active })
    .from(menuCategory)
    .where(and(eq(menuCategory.venueId, venueId), isNull(menuCategory.archivedAt)))
    .orderBy(asc(menuCategory.sortOrder), asc(menuCategory.createdAt));

  const items = await db
    .select({
      id: menuItem.id,
      categoryId: menuItem.categoryId,
      priceLek: menuItem.priceLek,
      photoUrl: menuItem.photoUrl,
      available: menuItem.available,
      suggestInBasket: menuItem.suggestInBasket,
      tags: menuItem.tags,
      allergens: menuItem.allergens,
    })
    .from(menuItem)
    .where(and(eq(menuItem.venueId, venueId), isNull(menuItem.archivedAt), itemIds ? inArray(menuItem.id, itemIds) : undefined))
    .orderBy(asc(menuItem.sortOrder), asc(menuItem.createdAt));

  const ids = items.map((i) => i.id);
  const groups = ids.length
    ? await db
        .select({ id: optionGroup.id, itemId: optionGroup.itemId, minSelect: optionGroup.minSelect, maxSelect: optionGroup.maxSelect })
        .from(optionGroup)
        .where(and(eq(optionGroup.venueId, venueId), isNull(optionGroup.archivedAt), inArray(optionGroup.itemId, ids)))
        .orderBy(asc(optionGroup.sortOrder))
    : [];
  const groupIds = groups.map((g) => g.id);
  const options = groupIds.length
    ? await db
        .select({ id: menuOption.id, groupId: menuOption.groupId, priceDeltaLek: menuOption.priceDeltaLek, available: menuOption.available })
        .from(menuOption)
        .where(and(eq(menuOption.venueId, venueId), isNull(menuOption.archivedAt), inArray(menuOption.groupId, groupIds)))
        .orderBy(asc(menuOption.sortOrder))
    : [];

  const categoryTexts = await readTexts(db, venueId, 'menu_category', categories.map((c) => c.id));
  const itemTexts = await readTexts(db, venueId, 'menu_item', ids);
  const groupTexts = await readTexts(db, venueId, 'option_group', groupIds);
  const optionTexts = await readTexts(db, venueId, 'menu_option', options.map((o) => o.id));

  return {
    categories: categories.map((c) => ({ ...c, name: categoryTexts.get(c.id)!.name })),
    items: items.map((item) => ({
      ...item,
      name: itemTexts.get(item.id)!.name,
      description: itemTexts.get(item.id)!.description,
      optionGroups: groups
        .filter((g) => g.itemId === item.id)
        .map(({ itemId: _itemId, ...g }) => ({
          ...g,
          name: groupTexts.get(g.id)!.name,
          options: options.filter((o) => o.groupId === g.id).map(({ groupId: _groupId, ...o }) => ({ ...o, name: optionTexts.get(o.id)!.name })),
        })),
    })),
  };
}

/* Categories ---------------------------------------------------------------- */

export async function createCategory(db: Db, venueId: string, input: CategoryInput): Promise<MenuCategoryRow> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ sortOrder: sql<number>`coalesce(max(${menuCategory.sortOrder}) + 1, 0)` })
      .from(menuCategory)
      .where(eq(menuCategory.venueId, venueId));
    const [row] = await tx
      .insert(menuCategory)
      .values({ venueId, sortOrder: next!.sortOrder })
      .returning({ id: menuCategory.id, active: menuCategory.active });
    await writeTexts(tx, venueId, 'menu_category', row!.id, 'name', input.name);
    return { ...row!, name: input.name };
  });
}

export async function updateCategory(db: Db, venueId: string, id: string, input: { name?: LocalizedText; active?: boolean }) {
  return db.transaction(async (tx) => {
    const where = and(eq(menuCategory.venueId, venueId), eq(menuCategory.id, id), isNull(menuCategory.archivedAt));
    const [row] = input.active === undefined
      ? await tx.select({ id: menuCategory.id }).from(menuCategory).where(where)
      : await tx.update(menuCategory).set({ active: input.active }).where(where).returning({ id: menuCategory.id });
    if (!row) return false;
    if (input.name) await writeTexts(tx, venueId, 'menu_category', id, 'name', input.name);
    return true;
  });
}

/** Archives an empty category. One that still holds dishes is refused, so nothing vanishes by accident. */
export async function archiveCategory(db: Db, venueId: string, id: string): Promise<'archived' | 'not_found' | 'not_empty'> {
  return db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: menuCategory.id })
      .from(menuCategory)
      .where(and(eq(menuCategory.venueId, venueId), eq(menuCategory.id, id), isNull(menuCategory.archivedAt)));
    if (!category) return 'not_found';
    const [dishes] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(menuItem)
      .where(and(eq(menuItem.venueId, venueId), eq(menuItem.categoryId, id), isNull(menuItem.archivedAt)));
    if (dishes!.n > 0) return 'not_empty';
    await tx.update(menuCategory).set({ archivedAt: sql`now()` }).where(and(eq(menuCategory.venueId, venueId), eq(menuCategory.id, id)));
    return 'archived';
  });
}

/* Dishes -------------------------------------------------------------------- */

/**
 * Creates a dish (itemId null) or replaces one, with its option groups and options.
 * Groups and options sent with an id are updated and must already belong to this dish; ones sent
 * without an id are created; existing ones left out are archived.
 */
export async function saveItem(db: Db, venueId: string, itemId: string | null, input: MenuItemInput): Promise<MenuItem> {
  return db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: menuCategory.id })
      .from(menuCategory)
      .where(and(eq(menuCategory.venueId, venueId), eq(menuCategory.id, input.categoryId), isNull(menuCategory.archivedAt)));
    if (!category) throw new ApiError(400, 'unknown_category');

    const fields = {
      categoryId: input.categoryId,
      priceLek: input.priceLek,
      photoUrl: input.photoUrl,
      available: input.available,
      suggestInBasket: input.suggestInBasket,
      tags: input.tags,
      allergens: input.allergens,
    };

    let id: string;
    if (itemId === null) {
      const [next] = await tx
        .select({ sortOrder: sql<number>`coalesce(max(${menuItem.sortOrder}) + 1, 0)` })
        .from(menuItem)
        .where(and(eq(menuItem.venueId, venueId), eq(menuItem.categoryId, input.categoryId)));
      const [row] = await tx.insert(menuItem).values({ venueId, ...fields, sortOrder: next!.sortOrder }).returning({ id: menuItem.id });
      id = row!.id;
    } else {
      const [row] = await tx
        .update(menuItem)
        .set(fields)
        .where(and(eq(menuItem.venueId, venueId), eq(menuItem.id, itemId), isNull(menuItem.archivedAt)))
        .returning({ id: menuItem.id });
      if (!row) throw notFound();
      id = row.id;
    }
    await writeTexts(tx, venueId, 'menu_item', id, 'name', input.name);
    await writeTexts(tx, venueId, 'menu_item', id, 'description', input.description);
    await syncOptionGroups(tx, venueId, id, input.optionGroups);

    const saved = await loadMenu(tx, venueId, { itemIds: [id] });
    return saved.items[0]!;
  });
}

async function syncOptionGroups(tx: Executor, venueId: string, itemId: string, groups: MenuItemInput['optionGroups']) {
  const existingGroups = await tx
    .select({ id: optionGroup.id })
    .from(optionGroup)
    .where(and(eq(optionGroup.venueId, venueId), eq(optionGroup.itemId, itemId), isNull(optionGroup.archivedAt)));
  const known = new Set(existingGroups.map((g) => g.id));
  const kept = new Set<string>();

  for (const [groupIndex, group] of groups.entries()) {
    let groupId: string;
    const fields = { minSelect: group.minSelect, maxSelect: group.maxSelect, sortOrder: groupIndex };
    if (group.id) {
      // An id from another dish (or another venue) is refused, never silently adopted.
      if (!known.has(group.id) || kept.has(group.id)) throw new ApiError(400, 'unknown_option_group');
      await tx.update(optionGroup).set(fields).where(and(eq(optionGroup.venueId, venueId), eq(optionGroup.id, group.id)));
      groupId = group.id;
    } else {
      const [row] = await tx.insert(optionGroup).values({ venueId, itemId, ...fields }).returning({ id: optionGroup.id });
      groupId = row!.id;
    }
    kept.add(groupId);
    await writeTexts(tx, venueId, 'option_group', groupId, 'name', group.name);
    await syncOptions(tx, venueId, groupId, group.options, Boolean(group.id));
  }

  const dropped = [...known].filter((id) => !kept.has(id));
  if (dropped.length > 0) {
    await tx.update(optionGroup).set({ archivedAt: sql`now()` }).where(and(eq(optionGroup.venueId, venueId), inArray(optionGroup.id, dropped)));
    await tx
      .update(menuOption)
      .set({ archivedAt: sql`now()` })
      .where(and(eq(menuOption.venueId, venueId), inArray(menuOption.groupId, dropped), isNull(menuOption.archivedAt)));
  }
}

async function syncOptions(tx: Executor, venueId: string, groupId: string, options: MenuItemInput['optionGroups'][number]['options'], groupExisted: boolean) {
  const existing = groupExisted
    ? await tx
        .select({ id: menuOption.id })
        .from(menuOption)
        .where(and(eq(menuOption.venueId, venueId), eq(menuOption.groupId, groupId), isNull(menuOption.archivedAt)))
    : [];
  const known = new Set(existing.map((o) => o.id));
  const kept = new Set<string>();

  for (const [optionIndex, option] of options.entries()) {
    const fields = { priceDeltaLek: option.priceDeltaLek, available: option.available, sortOrder: optionIndex };
    let optionId: string;
    if (option.id) {
      if (!known.has(option.id) || kept.has(option.id)) throw new ApiError(400, 'unknown_option');
      await tx.update(menuOption).set(fields).where(and(eq(menuOption.venueId, venueId), eq(menuOption.id, option.id)));
      optionId = option.id;
    } else {
      const [row] = await tx.insert(menuOption).values({ venueId, groupId, ...fields }).returning({ id: menuOption.id });
      optionId = row!.id;
    }
    kept.add(optionId);
    await writeTexts(tx, venueId, 'menu_option', optionId, 'name', option.name);
  }

  const dropped = [...known].filter((id) => !kept.has(id));
  if (dropped.length > 0) {
    await tx.update(menuOption).set({ archivedAt: sql`now()` }).where(and(eq(menuOption.venueId, venueId), inArray(menuOption.id, dropped)));
  }
}

/** The sold-out switch. Returns false when the dish isn't on this venue's menu. */
export async function setItemAvailability(db: Db, venueId: string, itemId: string, available: boolean): Promise<boolean> {
  const rows = await db
    .update(menuItem)
    .set({ available })
    .where(and(eq(menuItem.venueId, venueId), eq(menuItem.id, itemId), isNull(menuItem.archivedAt)))
    .returning({ id: menuItem.id });
  return rows.length > 0;
}

export async function archiveItem(db: Db, venueId: string, itemId: string): Promise<boolean> {
  const rows = await db
    .update(menuItem)
    .set({ archivedAt: sql`now()` })
    .where(and(eq(menuItem.venueId, venueId), eq(menuItem.id, itemId), isNull(menuItem.archivedAt)))
    .returning({ id: menuItem.id });
  return rows.length > 0;
}
