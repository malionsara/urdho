import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createApp } from '../app';
import { createDb } from '../db/client';
import { requireEnv } from '../env';
import { storageFromEnv } from '../photos';
import { liveTarget } from './live';
import { runSmokeCheck, type SmokeOptions, type StepResult } from './smoke-check';

/*
 * The health check: one table's whole evening, from scan to paid, through the real API, in a few
 * seconds. Run it after a deploy and before service; it orders from its own hidden venue
 * (urdho-check), never from a restaurant's, and stays out of the pilot numbers.
 *
 *   pnpm smoke          the API in this process, on the database in .env (no server needed)
 *   pnpm smoke --live   the live site, with the key in .env.operator; also loads the page and app files
 *
 * Exits with code 1 when a step fails.
 */

const { values } = parseArgs({ options: { live: { type: 'boolean', default: false } } });

let options: SmokeOptions;
let finish = async () => {};
if (values.live) {
  const { url, token } = liveTarget();
  options = { baseUrl: url, operatorToken: token, site: true };
} else {
  const { db, pool } = createDb(requireEnv('DATABASE_URL'));
  // A key for this run only: the operator part of an in-process API is never reachable from outside.
  const operatorToken = randomBytes(24).toString('base64url');
  const app = createApp({ db, storage: storageFromEnv(), guestSecret: requireEnv('GUEST_SESSION_SECRET'), operatorToken });
  options = { baseUrl: 'http://localhost', operatorToken, fetch: (url, init) => app.request(url, init) };
  finish = () => pool.end();
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const print = (s: StepResult) => {
  console.log(`  ${s.ok ? '✓' : '✗'} ${s.name.padEnd(52)} ${String(Math.round(s.ms)).padStart(5)} ms`);
  if (s.problem) console.log(`      ${s.problem}`);
};

console.log(`\nHealth check${values.live ? ` on ${options.baseUrl}` : ' (local database, API in this process)'}\n`);
const result = await runSmokeCheck({ ...options, onStep: print }).finally(finish);
if (result.ok) {
  console.log(`\nOK in ${seconds(result.ms)}: a guest ordered and paid, and the board, the kitchen and the waiter all worked.\n`);
} else {
  const failed = result.steps.find((s) => !s.ok);
  console.log(`\nFAILED at "${failed?.name}" after ${seconds(result.ms)}. Restaurants may be hitting the same problem.\n`);
  process.exitCode = 1;
}
