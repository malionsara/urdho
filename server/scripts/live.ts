import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/*
 * The live site, for the operator commands' --live flag. The address and the operator key live in
 * .env.operator (git-ignored), never in .env, so a local command can't reach production by accident:
 *
 *   URDHO_URL=https://urdho.al
 *   URDHO_OPERATOR_TOKEN=…   (the same value as OPERATOR_TOKEN on the Vercel project)
 *   TELEGRAM_BOT_TOKEN=…     (optional: where pnpm smoke --live reports a failure, see alerts.ts)
 *   TELEGRAM_CHAT_ID=…
 *
 * On GitHub (the hourly health check) the same names come from the repository's secrets instead.
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

/** .env.operator's settings, with the environment's taking precedence; empty without the file. */
export function operatorSettings(): Record<string, string | undefined> {
  let file = '';
  try {
    file = readFileSync('.env.operator', 'utf8');
  } catch {
    // No file: on GitHub, or a machine without the live key.
  }
  const fromFile = parseEnv(file) as Record<string, string | undefined>;
  const names = ['URDHO_URL', 'URDHO_OPERATOR_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  return Object.fromEntries(names.map((name) => [name, process.env[name] || fromFile[name]]));
}

export function liveTarget(): { url: string; token: string } {
  const env = operatorSettings();
  const url = env.URDHO_URL?.replace(/\/+$/, '');
  const token = env.URDHO_OPERATOR_TOKEN;
  if (!url || !token) throw new Error('--live needs URDHO_URL and URDHO_OPERATOR_TOKEN, in .env.operator or the environment (see README, Deploy).');
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
