import { parseArgs } from 'node:util';
import { newVenueInput } from '../../shared/schemas';
import { createDb } from '../db/client';
import { requireEnv } from '../env';
import { ApiError } from '../http';
import { createVenueWithOwner, type CreatedVenue } from '../repos/operator';
import { callLive, liveTarget, OperatorError } from './live';

/*
 * Creates a pilot venue, its tables and its owner, and prints the owner's temporary password once.
 *
 *   pnpm venue:create --name "Tavë & Raki" --slug tave-raki --owner-name "Arta Hoxha" --owner-email arta@example.com --tables 8
 *
 * Add --live to create it on the live site (through /api/operator, with the key in .env.operator);
 * without it, the venue goes into the database in .env.
 */

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    slug: { type: 'string' },
    'owner-name': { type: 'string' },
    'owner-email': { type: 'string' },
    tables: { type: 'string' },
    live: { type: 'boolean', default: false },
  },
});

const parsed = newVenueInput.safeParse({
  name: values.name,
  slug: values.slug,
  ownerName: values['owner-name'],
  ownerEmail: values['owner-email'],
  tables: values.tables,
});

if (!parsed.success) {
  console.error('Usage: pnpm venue:create --name "Venue name" --slug venue-name --owner-name "Full Name" --owner-email owner@example.com [--tables 6] [--live]\n');
  const flag: Record<string, string> = { ownerName: 'owner-name', ownerEmail: 'owner-email' };
  for (const issue of parsed.error.issues) console.error(`  --${flag[String(issue.path[0])] ?? issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const input = parsed.data;

const MESSAGES: Record<string, string> = {
  slug_taken: `the address "${input.slug}" belongs to another venue`,
  email_taken: `${input.ownerEmail} already has an account`,
  slug_or_email_taken: 'the address or the email was taken a moment ago',
  unauthorized: 'the key in .env.operator is not the one on the live site',
  not_found: 'the live site has no OPERATOR_TOKEN set',
};

async function create(): Promise<{ created: CreatedVenue; site: string }> {
  if (values.live) {
    return { created: await callLive<CreatedVenue>('POST', '/venues', input), site: liveTarget().url };
  }
  const { db, pool } = createDb(requireEnv('DATABASE_URL'));
  try {
    return { created: await createVenueWithOwner(db, input), site: 'http://localhost:5173' };
  } finally {
    await pool.end();
  }
}

try {
  const { created, site } = await create();
  const { venue, owner, tables } = created;
  console.log(`\nCreated "${venue.name}" with ${tables.length} tables${values.live ? ' on the live site' : ''}.\n`);
  console.log(`Owner:              ${owner.name} <${owner.email}>`);
  console.log(`Temporary password: ${owner.temporaryPassword}`);
  console.log(`Sign-in:            ${site}/staff`);
  console.log(`Table 1 address:    ${site}/${venue.slug}/t/${tables[0]!.qrToken}`);
  console.log('\nGive the password to the owner; it is not shown again. They choose their own at first sign-in,');
  console.log('then set the menu, photos and opening hours, and print the table cards under QR codes.\n');
} catch (error) {
  const code = error instanceof OperatorError || error instanceof ApiError ? error.code : null;
  if (!code) throw error;
  console.error(`\nNot created: ${MESSAGES[code] ?? code}.\n`);
  process.exitCode = 1;
}
