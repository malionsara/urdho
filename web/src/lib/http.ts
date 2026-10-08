import { slowApi } from '../guest/devFlags';

/**
 * An error from the API, or "network" when the request never got an answer. The code is what the
 * screens translate (errors.api.<code> in the i18n files); the API never sends user-facing text.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiError => error instanceof ApiError && (code === undefined || error.code === code);

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
}

/** Calls /api on the same site. Cookies go along automatically; nothing else carries identity. */
export async function api<T>(path: string, { method = 'GET', body, form }: Options = {}): Promise<T> {
  if (slowApi()) await new Promise((resolve) => setTimeout(resolve, 1500));
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; details?: unknown } } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'internal', data?.error?.details);
  return data as T;
}

/** Retry only what might work a second time: lost connections and server hiccups, never a refusal. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}
