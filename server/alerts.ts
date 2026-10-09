/*
 * Alerts to the team's Telegram chat: an unexpected server error on the live site, and a failed
 * health check (`pnpm smoke --live`, run every hour by .github/workflows/health-check.yml).
 * Without TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID nothing is sent.
 *
 * A message names what failed and where, never what anyone typed: a database error is reported by
 * the database's own message, not the query's values, which can hold guests' names and notes.
 */

export interface TelegramConfig {
  token: string;
  chatId: string;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | undefined {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : undefined;
}

/** Sends one message; true when Telegram took it. Never throws: a lost alert must not break anything else. */
export async function sendTelegram(config: TelegramConfig, text: string, send: Fetch = fetch): Promise<boolean> {
  try {
    const res = await send(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** One line about an error, without the values a failed query was given. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 200);
  // Drizzle's "Failed query: … params: …" wraps the database's error, which says what went wrong.
  const cause = error.cause as { message?: string; code?: string } | undefined;
  const source = error.message.startsWith('Failed query') && cause?.message ? cause : error;
  const line = (source.message ?? '').split('\n')[0]!.slice(0, 200);
  const code = 'code' in source && source.code ? ` [${source.code}]` : '';
  return `${error.name}: ${line}${code}`;
}

/** How long the same error on the same route stays quiet after it was reported. */
export const QUIET_MINUTES = 15;

export type ServerErrorAlert = (error: unknown, where: { method: string; route: string }) => void;

/**
 * Reports unexpected server errors, once per kind of error and route every 15 minutes from each
 * running copy of the API, so a broken page doesn't flood the chat. `defer` keeps the function
 * alive until the message is out (Vercel's waitUntil) without delaying the response.
 */
export function serverErrorAlerts(
  config: TelegramConfig | undefined,
  { defer = (task: Promise<unknown>) => void task, send = fetch as Fetch, now = Date.now }: { defer?: (task: Promise<unknown>) => void; send?: Fetch; now?: () => number } = {},
): ServerErrorAlert | undefined {
  if (!config) return undefined;
  const lastSent = new Map<string, number>();
  return (error, { method, route }) => {
    const summary = describeError(error);
    const key = `${method} ${route} ${summary.split(':')[0]}`;
    const at = now();
    if (at - (lastSent.get(key) ?? -Infinity) < QUIET_MINUTES * 60_000) return;
    lastSent.set(key, at);
    defer(sendTelegram(config, `🔴 Urdho: server error\n${method} ${route}\n${summary}`, send));
  };
}
