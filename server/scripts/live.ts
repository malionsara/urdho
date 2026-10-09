import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/*
 * The live site, for the operator commands' --live flag. The address and the operator key live in
 * .env.operator (git-ignored), never in .env, so a local command can't reach production by accident:
 *
 *   URDHO_URL=https://urdho.al
 *   URDHO_OPERATOR_TOKEN=…   (the same value as OPERATOR_TOKEN on the Vercel project)
 */

export class OperatorError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export function liveTarget(): { url: string; token: string } {
  let file: string;
  try {
    file = readFileSync('.env.operator', 'utf8');
  } catch {
    throw new Error('No .env.operator file. It holds URDHO_URL and URDHO_OPERATOR_TOKEN for --live (see README, Deploy).');
  }
  const env = parseEnv(file);
  const url = env.URDHO_URL?.replace(/\/+$/, '');
  const token = env.URDHO_OPERATOR_TOKEN;
  if (!url || !token) throw new Error('.env.operator needs both URDHO_URL and URDHO_OPERATOR_TOKEN.');
  return { url, token };
}

/** Calls /api/operator on the live site. */
export async function callLive<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { url, token } = liveTarget();
  const res = await fetch(`${url}/api/operator${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; details?: unknown } } | null;
  if (!res.ok) throw new OperatorError(res.status, data?.error?.code ?? `http_${res.status}`, data?.error?.details);
  return data as T;
}
