import { pathToFileURL } from 'node:url';
import { and, eq, inArray } from 'drizzle-orm';
import { DEMO_SLUG, SEED_CATEGORIES, SEED_STAFF, SEED_TABLES, SEED_VENUE } from '../../shared/demo';
import type { LocalizedText } from '../../shared/types';
import { hashPassword, newQrToken } from '../auth/crypto';
import { isLocalDatabase, requireEnv } from '../env';
import { resetQrToken } from '../repos/sessions';
import { createDb, type Db } from './client';
import { diningTable, menuCategory, menuItem, menuOption, optionGroup, staffUser, translation, venue } from './schema';

type TranslationRow = typeof translation.$inferInsert;

/**
 * Creates the demo venue from shared/demo.ts: 6 tables, 3 categories, 12 dishes with options,
 * texts in Albanian and English. Replaces an existing demo venue; other venues are untouched.
 * With a staffPassword, also creates the demo owner, manager and waiter with that password.
 * For databases off this machine: mustChangePassword makes each account replace that password at
 * first sign-in, and privateTableCodes gives the tables random codes instead of demo-1 … demo-6.
 */
export async function seedDemoVenue(
  db: Db,
  {
    staffPassword,
    mustChangePassword = false,
    privateTableCodes = false,
  }: { staffPassword?: string; mustChangePassword?: boolean; privateTableCodes?: boolean } = {},
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

    await tx
      .insert(diningTable)
      .values(SEED_TABLES.map((t) => ({ venueId, number: t.number, qrToken: privateTableCodes ? newQrToken() : t.qrToken })));

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

/**
 * Gives every demo table still on a public code (demo-1 … demo-6) a new random one, the same way
 * "Reset code" does in the dashboard. Returns how many tables changed.
 */
export async function hidePublicTableCodes(db: Db, venueId: string): Promise<number> {
  const publicCodes = SEED_TABLES.map((t) => t.qrToken);
  const tables = await db
    .select({ id: diningTable.id })
    .from(diningTable)
    .where(and(eq(diningTable.venueId, venueId), inArray(diningTable.qrToken, publicCodes)));
  for (const table of tables) await resetQrToken(db, venueId, table.id);
  return tables.length;
}

// `pnpm db:seed`: replaces the demo venue.
// `pnpm db:seed --on-deploy` (every Vercel build): creates the demo venue only if DEMO_STAFF_PASSWORD
// is set on the project and the venue doesn't exist yet, so it never overwrites anything. An existing
// demo venue off this machine only has any public table codes replaced.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const onDeploy = process.argv.includes('--on-deploy');
  const staffPassword = process.env.DEMO_STAFF_PASSWORD || undefined;
  const url = process.env.DATABASE_URL_UNPOOLED || requireEnv('DATABASE_URL');
  const { db, pool } = createDb(url);
  try {
    // Off this machine (Neon), the shared demo password only gets each account in once, and the
    // tables get codes nobody can guess.
    const offMachine = !isLocalDatabase(url);
    const [existing] = onDeploy ? await db.select({ id: venue.id }).from(venue).where(eq(venue.slug, DEMO_SLUG)) : [];
    if (existing) {
      const hidden = offMachine ? await hidePublicTableCodes(db, existing.id) : 0;
      console.log(`Demo venue: "${DEMO_SLUG}" already exists, left as it is${hidden ? `, except ${hidden} public table codes now replaced with private ones` : ''}.`);
    } else if (onDeploy && !staffPassword) {
      console.log('Demo venue: not created (DEMO_STAFF_PASSWORD is not set).');
    } else {
      const mustChangePassword = offMachine;
      await seedDemoVenue(db, { staffPassword, mustChangePassword, privateTableCodes: offMachine });
      if (staffPassword) {
        const note = mustChangePassword ? ', to be replaced at first sign-in' : '';
        console.log(`Demo staff: ${SEED_STAFF.map((s) => s.email).join(', ')} (password from DEMO_STAFF_PASSWORD${note}).`);
      }
      console.log(`Seeded the "${DEMO_SLUG}" venue: ${SEED_TABLES.length} tables, ${SEED_CATEGORIES.length} categories, ${SEED_CATEGORIES.flatMap((c) => c.items).length} dishes.`);
    }
  } finally {
    await pool.end();
  }
}
