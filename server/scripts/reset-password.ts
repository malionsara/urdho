import { parseArgs } from 'node:util';
import { staffPasswordResetInput } from '../../shared/schemas';
import { createDb } from '../db/client';
import { requireEnv } from '../env';
import { resetStaffPassword, type PasswordReset } from '../repos/operator';
import { callLive, liveTarget, OperatorError } from './live';

/*
 * A forgotten password, for anyone in any venue, owners included. Prints a new temporary password
 * once; the person is signed out everywhere and chooses their own password at the next sign-in.
 *
 *   pnpm staff:reset-password --email arta@example.com [--live]
 */

const { values } = parseArgs({ options: { email: { type: 'string' }, live: { type: 'boolean', default: false } } });
const parsed = staffPasswordResetInput.safeParse({ email: values.email });
if (!parsed.success) {
  console.error('Usage: pnpm staff:reset-password --email person@example.com [--live]\n');
  process.exit(1);
}
const { email } = parsed.data;

async function reset(): Promise<{ result: PasswordReset | undefined; site: string }> {
  if (values.live) {
    try {
      return { result: await callLive<PasswordReset>('POST', '/staff/password-reset', { email }), site: liveTarget().url };
    } catch (error) {
      if (error instanceof OperatorError && error.code === 'not_found' && error.status === 404) {
        // Either no such account, or no operator key on the site: tell them apart.
        await callLive('GET', '/stats?days=1');
        return { result: undefined, site: liveTarget().url };
      }
      throw error;
    }
  }
  const { db, pool } = createDb(requireEnv('DATABASE_URL'));
  try {
    return { result: await resetStaffPassword(db, email), site: 'http://localhost:5173' };
  } finally {
    await pool.end();
  }
}

try {
  const { result, site } = await reset();
  if (!result) {
    console.error(`\nNo account has the email ${email}${values.live ? ' on the live site' : ''}.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\nNew temporary password for ${result.name} (${result.role}, ${result.venue.name}).\n`);
    console.log(`Email:              ${result.email}`);
    console.log(`Temporary password: ${result.temporaryPassword}`);
    console.log(`Sign-in:            ${site}/staff`);
    console.log('\nTell them in person or by phone; it is not shown again. They were signed out on every device');
    console.log('and choose their own password when they sign in.\n');
  }
} catch (error) {
  if (!(error instanceof OperatorError)) throw error;
  const messages: Record<string, string> = {
    unauthorized: 'the key in .env.operator is not the one on the live site',
    not_found: 'the live site has no OPERATOR_TOKEN set',
  };
  console.error(`\nNot reset: ${messages[error.code] ?? error.code}.\n`);
  process.exitCode = 1;
}
