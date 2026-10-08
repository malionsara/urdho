import { parseArgs } from 'node:util';
import { z } from 'zod';
import { hashPassword, newQrToken, temporaryPassword } from '../auth/crypto';
import { createDb } from '../db/client';
import { diningTable, staffUser, venue } from '../db/schema';
import { requireEnv } from '../env';
import { isUniqueViolation } from '../http';

/*
 * Creates a pilot venue, its tables and its owner, and prints the owner's temporary password once.
 *
 *   pnpm venue:create --name "Tavë & Raki" --slug tave-raki --owner-name "Arta Hoxha" --owner-email arta@example.com --tables 8
 */

const args = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens, e.g. tave-raki'),
    'owner-name': z.string().trim().min(1).max(80),
    'owner-email': z.string().trim().toLowerCase().pipe(z.email()),
    tables: z.coerce.number().int().min(1).max(200).default(6),
  })
  .safeParse(
    parseArgs({
      options: {
        name: { type: 'string' },
        slug: { type: 'string' },
        'owner-name': { type: 'string' },
        'owner-email': { type: 'string' },
        tables: { type: 'string' },
      },
    }).values,
  );

if (!args.success) {
  console.error('Usage: pnpm venue:create --name "Venue name" --slug venue-name --owner-name "Full Name" --owner-email owner@example.com [--tables 6]\n');
  for (const issue of args.error.issues) console.error(`  --${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const { name, slug, tables } = args.data;
const ownerName = args.data['owner-name'];
const ownerEmail = args.data['owner-email'];
const password = temporaryPassword();
const { db, pool } = createDb(requireEnv('DATABASE_URL'));

try {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(venue)
      .values({
        name,
        slug,
        openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: true, from: '08:00', to: '23:00' })),
      })
      .returning({ id: venue.id });
    const venueId = created!.id;
    await tx.insert(diningTable).values(Array.from({ length: tables }, (_, i) => ({ venueId, number: i + 1, qrToken: newQrToken() })));
    await tx.insert(staffUser).values({ venueId, name: ownerName, email: ownerEmail, role: 'owner', passwordHash: await hashPassword(password), mustChangePassword: true });
  });

  console.log(`\nCreated "${name}" (${slug}) with ${tables} tables.\n`);
  console.log(`Owner:              ${ownerName} <${ownerEmail}>`);
  console.log(`Temporary password: ${password}`);
  console.log('\nGive the password to the owner. They choose their own at first sign-in; it is not shown again.\n');
} catch (error) {
  if (isUniqueViolation(error)) {
    console.error(`\nNot created: the slug "${slug}" or the email ${ownerEmail} is already in use.\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await pool.end();
}
