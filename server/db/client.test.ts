import { describe, expect, it } from 'vitest';
import { withFullCertificateCheck } from './client';

describe('database addresses', () => {
  it("asks for Neon's certificate to be checked fully, keeping the other settings", () => {
    const neon = 'postgresql://user:secret@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    const url = new URL(withFullCertificateCheck(neon));
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('channel_binding')).toBe('require');
    expect(url.password).toBe('secret');
  });

  it('leaves a local address without SSL as it is', () => {
    expect(withFullCertificateCheck('postgres://urdho:urdho@localhost:5433/urdho')).toBe('postgres://urdho:urdho@localhost:5433/urdho');
  });
});
