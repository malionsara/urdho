import { eq } from 'drizzle-orm';
import type { VenueSettingsInput } from '../../shared/schemas';
import type { Venue } from '../../shared/types';
import type { Db } from '../db/client';
import { venue } from '../db/schema';

const venueColumns = {
  id: venue.id,
  slug: venue.slug,
  name: venue.name,
  logoUrl: venue.logoUrl,
  coverUrl: venue.coverUrl,
  brandColor: venue.brandColor,
  languages: venue.languages,
  defaultLanguage: venue.defaultLanguage,
  timezone: venue.timezone,
  openingHours: venue.openingHours,
};

export async function getVenue(db: Db, venueId: string): Promise<Venue | undefined> {
  const [row] = await db.select(venueColumns).from(venue).where(eq(venue.id, venueId));
  return row;
}

export async function updateVenueSettings(db: Db, venueId: string, settings: VenueSettingsInput): Promise<Venue | undefined> {
  const [row] = await db.update(venue).set(settings).where(eq(venue.id, venueId)).returning(venueColumns);
  return row;
}
