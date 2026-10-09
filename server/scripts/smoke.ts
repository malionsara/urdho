import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { sendTelegram, telegramConfig } from '../alerts';
import { createApp } from '../app';
import { createDb } from '../db/client';
import { requireEnv } from '../env';
import { storageFromEnv } from '../photos';
import { liveTarget, operatorSettings } from './live';
import { failureAlert, runSmokeCheck, type SmokeOptions, type StepResult } from './smoke-check';

/*
 * The health check: one table's whole evening, from scan to paid, through the real API, in a few
 * seconds. Run it after a deploy and before service; it orders from its own hidden venue
 * (urdho-check), never from a restaurant's, and stays out of the pilot numbers.
 *
 *   pnpm smoke          the API in this process, on the database in .env (no server needed)
 *   pnpm smoke --live   the live site, with the key in .env.operator; also loads the page and app files
 *
 * Exits with code 1 when a step fails. A failed --live check also goes to the team's Telegram when
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set; GitHub runs it every hour and after each deploy.
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
  const telegram = values.live ? telegramConfig(operatorSettings()) : undefined;
  if (telegram) console.log((await sendTelegram(telegram, failureAlert(result, options.baseUrl))) ? 'Sent to Telegram.\n' : "Couldn't reach Telegram.\n");
}
