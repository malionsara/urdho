import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { SetupMark, VenueSetup } from '../../shared/types';
import type { Db } from '../db/client';
import { guestOrder, menuCategory, menuItem, staffUser, venue } from '../db/schema';

/*
 * The owner's get-started checklist. Each step is worked out from the venue's own data, so it
 * ticks itself as the owner goes; only what the app can't see (the hours were checked, the QR
 * codes are on the tables) is ticked by hand, in venue.setup_marks. Every function takes venueId first.
 */

export async function loadSetup(db: Db, venueId: string): Promise<VenueSetup | undefined> {
  const [place] = await db
    .select({ logoUrl: venue.logoUrl, coverUrl: venue.coverUrl, marks: venue.setupMarks })
    .from(venue)
    .where(eq(venue.id, venueId));
  if (!place) return undefined;

  // Dishes per category, split by whether guests can see the category.
  const categories = await db
    .select({
      active: menuCategory.active,
      dishes: sql<number>`count(${menuItem.id})::int`,
      withPhoto: sql<number>`count(${menuItem.photoUrl})::int`,
    })
    .from(menuCategory)
    .leftJoin(menuItem, and(eq(menuItem.categoryId, menuCategory.id), eq(menuItem.venueId, menuCategory.venueId), isNull(menuItem.archivedAt)))
    .where(and(eq(menuCategory.venueId, venueId), isNull(menuCategory.archivedAt)))
    .groupBy(menuCategory.id);
  const shown = categories.filter((c) => c.active);
  const shownDishes = shown.reduce((sum, c) => sum + c.dishes, 0);
  const withPhoto = shown.reduce((sum, c) => sum + c.withPhoto, 0);

  const [staff] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staffUser)
    .where(and(eq(staffUser.venueId, venueId), ne(staffUser.role, 'owner')));
  const [order] = await db.select({ id: guestOrder.id }).from(guestOrder).where(eq(guestOrder.venueId, venueId)).limit(1);

  const marked = (mark: SetupMark) => place.marks.includes(mark);
  return {
    steps: [
      { key: 'look', done: Boolean(place.logoUrl || place.coverUrl) },
      { key: 'hours', done: marked('hours') },
      { key: 'menu', done: shownDishes > 0, hiddenCategories: categories.filter((c) => !c.active && c.dishes > 0).length },
      // Half the dishes with a photo is enough to call it done; the count shows how far along it is.
      { key: 'photos', done: shownDishes > 0 && withPhoto * 2 >= shownDishes, progress: { done: withPhoto, total: shownDishes } },
      { key: 'staff', done: staff!.n > 0 },
      { key: 'qr', done: marked('qr') },
      { key: 'testOrder', done: order !== undefined },
    ],
    dismissed: marked('dismissed'),
  };
}

/** Ticks or unticks a step by hand, or puts the list away (and back). */
export async function setSetupMark(db: Db, venueId: string, mark: SetupMark, done: boolean): Promise<void> {
  await db
    .update(venue)
    .set({
      setupMarks: done
        ? sql`array(select distinct unnest(array_append(${venue.setupMarks}, ${mark}::text)))`
        : sql`array_remove(${venue.setupMarks}, ${mark}::text)`,
    })
    .where(eq(venue.id, venueId));
}
