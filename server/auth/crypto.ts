import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/*
 * Passwords: scrypt from Node's standard library, no package needed.
 * Stored as  scrypt$N$r$p$salt$hash  so the cost can rise later without breaking old hashes.
 */

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
// N = 2^15 needs 32 MiB; Node's default limit is exactly that, so allow a little more.
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, length, { ...options, maxmem: MAX_MEMORY }, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;

/**
 * Checks a password against a throwaway hash. Used when the email is unknown, so a wrong email
 * takes as long as a wrong password and the response time doesn't reveal which accounts exist.
 */
export async function verifyAgainstNothing(password: string): Promise<false> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummy);
  return false;
}

/* Session tokens and QR tokens ------------------------------------------------ */

/** A long random token for a cookie. Only its SHA-256 goes into the database. */
export const newSessionToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Whether a key someone sent matches ours. Compares hashes, which are always the same length, in constant time. */
export function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(sha256(given), 'hex'), Buffer.from(sha256(expected), 'hex'));
}

/** The key in an `Authorization: Bearer …` header, if any. */
export const bearerToken = (header: string | undefined) => header?.match(/^Bearer (.+)$/)?.[1];

/**
 * A table session's guest token. Derived from the session id with a server secret, so every guest
 * who scans the same table gets the same token while only its hash is stored.
 */
export const guestSessionToken = (secret: string, sessionId: string) => createHmac('sha256', secret).update(`table-session:${sessionId}`).digest('base64url');

/** A short random token for a table's QR code, e.g. "k3Jd9xQ2mL0a". */
export const newQrToken = () => randomBytes(9).toString('base64url');

/** A temporary password the owner reads out, e.g. "k7m-qx3-a9p". No look-alike characters. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const chars = Array.from(randomBytes(9), (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 3)}-${chars.slice(3, 6)}-${chars.slice(6, 9)}`;
}
