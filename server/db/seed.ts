import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { DEMO_SLUG, SEED_CATEGORIES, SEED_STAFF, SEED_TABLES, SEED_VENUE } from '../../shared/demo';
import type { LocalizedText } from '../../shared/types';
import { hashPassword } from '../auth/crypto';
import { isLocalDatabase, requireEnv } from '../env';
import { createDb, type Db } from './client';
import { diningTable, menuCategory, menuItem, menuOption, optionGroup, staffUser, translation, venue } from './schema';

type TranslationRow = typeof translation.$inferInsert;

/**
 * Creates the demo venue from shared/demo.ts: 6 tables, 3 categories, 12 dishes with options,
 * texts in Albanian and English. Replaces an existing demo venue; other venues are untouched.
 * With a staffPassword, also creates the demo owner, manager and waiter with that password; with
 * mustChangePassword, each must replace it at first sign-in (used for databases off this machine).
 */
export async function seedDemoVenue(
  db: Db,
  { staffPassword, mustChangePassword = false }: { staffPassword?: string; mustChangePassword?: boolean } = {},
): Promise<{ venueId: string }> {
  const passwordHash = staffPassword ? await hashPassword(staffPassword) : undefined;
  return db.transaction(async (tx) => {
    await tx.delete(venue).where(eq(venue.slug, DEMO_SLUG));

    const { name, slug, logoUrl, coverUrl, brandColor, languages, defaultLanguage, timezone, openingHours } = SEED_VENUE;
    const [created] = await tx
      .insert(venue)
      .values({ name, slug, logoUrl, coverUrl, brandColor, languages, defaultLanguage, timezone, openingHours })
      .returning({ id: venue.id });
    const venueId = created!.id;

    await tx.insert(diningTable).values(SEED_TABLES.map((t) => ({ venueId, number: t.number, qrToken: t.qrToken })));

    const texts: TranslationRow[] = [];
    const addTexts = (entityType: TranslationRow['entityType'], entityId: string, field: TranslationRow['field'], value: LocalizedText) => {
      for (const [lang, text] of Object.entries(value)) {
        if (text) texts.push({ venueId, entityType, entityId, field, lang: lang as TranslationRow['lang'], text });
      }
    };

    for (const [categoryIndex, category] of SEED_CATEGORIES.entries()) {
      const [c] = await tx.insert(menuCategory).values({ venueId, sortOrder: categoryIndex }).returning({ id: menuCategory.id });
      addTexts('menu_category', c!.id, 'name', category.name);

      for (const [itemIndex, item] of category.items.entries()) {
        const [i] = await tx
          .insert(menuItem)
          .values({
            venueId,
            categoryId: c!.id,
            priceLek: item.priceLek,
            photoUrl: item.photoUrl,
            available: item.available,
            suggestInBasket: item.suggestInBasket,
            tags: item.tags,
            allergens: item.allergens,
            sortOrder: itemIndex,
          })
          .returning({ id: menuItem.id });
        addTexts('menu_item', i!.id, 'name', item.name);
        addTexts('menu_item', i!.id, 'description', item.description);

        for (const [groupIndex, group] of item.optionGroups.entries()) {
          const [g] = await tx
            .insert(optionGroup)
            .values({ venueId, itemId: i!.id, minSelect: group.minSelect, maxSelect: group.maxSelect, sortOrder: groupIndex })
            .returning({ id: optionGroup.id });
          addTexts('option_group', g!.id, 'name', group.name);

          for (const [optionIndex, option] of group.options.entries()) {
            const [o] = await tx
              .insert(menuOption)
              .values({ venueId, groupId: g!.id, priceDeltaLek: option.priceDeltaLek, available: option.available, sortOrder: optionIndex })
              .returning({ id: menuOption.id });
            addTexts('menu_option', o!.id, 'name', option.name);
          }
        }
      }
    }

    await tx.insert(translation).values(texts);

    if (passwordHash) {
      await tx
        .insert(staffUser)
        .values(SEED_STAFF.map(({ name, email, role }) => ({ venueId, name, email, role, passwordHash, mustChangePassword })));
    }
    return { venueId };
  });
}

// `pnpm db:seed`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = requireEnv('DATABASE_URL');
  const { db, pool } = createDb(url);
  try {
    const staffPassword = process.env.DEMO_STAFF_PASSWORD || undefined;
    // Off this machine (Neon), the shared demo password only gets each account in once.
    const mustChangePassword = !isLocalDatabase(url);
    await seedDemoVenue(db, { staffPassword, mustChangePassword });
    if (staffPassword) {
      const note = mustChangePassword ? ', to be replaced at first sign-in' : '';
      console.log(`Demo staff: ${SEED_STAFF.map((s) => s.email).join(', ')} (password from DEMO_STAFF_PASSWORD${note}).`);
    }
    console.log(`Seeded the "${DEMO_SLUG}" venue: ${SEED_TABLES.length} tables, ${SEED_CATEGORIES.length} categories, ${SEED_CATEGORIES.flatMap((c) => c.items).length} dishes.`);
  } finally {
    await pool.end();
  }
}
