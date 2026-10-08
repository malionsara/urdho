import { describe, expect, it } from 'vitest';
import { hashPassword, newQrToken, sha256, temporaryPassword, verifyPassword } from './crypto';

describe('passwords', () => {
  it('stores a salted scrypt hash, never the password', async () => {
    const a = await hashPassword('tavë kosi 850');
    const b = await hashPassword('tavë kosi 850');
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toContain('tavë');
    expect(a).not.toBe(b);
  });

  it('accepts the right password and rejects others', async () => {
    const hash = await hashPassword('tavë kosi 850');
    expect(await verifyPassword('tavë kosi 850', hash)).toBe(true);
    expect(await verifyPassword('tave kosi 850', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('treats the same letters typed two ways as the same password', async () => {
    // "ë" as one character, and as "e" plus a combining diaeresis (some keyboards send this).
    const hash = await hashPassword('Fërgesë');
    expect(await verifyPassword('Fe\u0308rgese\u0308', hash)).toBe(true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
  });
});

describe('tokens', () => {
  it('makes readable temporary passwords without look-alike characters', () => {
    for (let i = 0; i < 50; i++) expect(temporaryPassword()).toMatch(/^[a-hj-km-np-z2-9]{3}-[a-hj-km-np-z2-9]{3}-[a-hj-km-np-z2-9]{3}$/);
  });

  it('makes QR tokens that are short, URL-safe and different each time', () => {
    const tokens = new Set(Array.from({ length: 100 }, newQrToken));
    expect(tokens.size).toBe(100);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it('hashes session tokens with SHA-256', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
