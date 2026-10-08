import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { StaffRole } from '../shared/types';

/** Who is calling, resolved from the session cookie. Every staff query is scoped by venueId. */
export interface StaffContext {
  sessionId: string;
  userId: string;
  venueId: string;
  role: StaffRole;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export type AppEnv = { Variables: { staff: StaffContext } };

/**
 * An error the client should see. The body is { error: { code } }; the web app translates codes,
 * so the API never sends user-facing text.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export const unauthorized = () => new ApiError(401, 'unauthorized');
export const forbidden = () => new ApiError(403, 'forbidden');
/** Also used for other venues' rows: they don't exist as far as the caller can tell. */
export const notFound = () => new ApiError(404, 'not_found');

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, ...(error.details ? { details: error.details } : {}) } }, error.status);
  }
  // Raised by Hono's own middleware, e.g. the CSRF check refusing a cross-site form post.
  if (error instanceof HTTPException) {
    return c.json({ error: { code: error.status === 403 ? 'forbidden' : 'bad_request' } }, error.status);
  }
  console.error(error);
  return c.json({ error: { code: 'internal' } }, 500);
};

/** Parses and validates a JSON body. Fields the schema doesn't know are dropped. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid_request', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.message })));
  }
  return parsed.data;
}

/** Postgres's code for a unique-constraint clash, looked up through Drizzle's wrapper. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause?.code ?? e.code) === '23505';
}

/**
 * The caller's IP address, or '' when unknown. On Vercel these headers are set by the platform,
 * which overwrites whatever the client sent; in local development there are none.
 */
export function clientAddress(c: Context): string {
  return c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
}
