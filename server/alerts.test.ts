import { DrizzleQueryError } from 'drizzle-orm/errors';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { describeError, sendTelegram, serverErrorAlerts, telegramConfig, type ServerErrorAlert } from './alerts';
import { ApiError, errorHandler } from './http';

const CONFIG = { token: '123:abc', chatId: '-100200' };

/** A fake Telegram that records what it was sent. */
function fakeTelegram(status = 200) {
  const sent: { url: string; body: { chat_id: string; text: string } }[] = [];
  const send = vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response('{}', { status });
  });
  return { sent, send };
}

describe('Telegram alerts', () => {
  it('are off until both the bot token and the chat are set', () => {
    expect(telegramConfig({})).toBeUndefined();
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: 'x' })).toBeUndefined();
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: ' x ', TELEGRAM_CHAT_ID: ' 42 ' })).toEqual({ token: 'x', chatId: '42' });
    expect(serverErrorAlerts(undefined)).toBeUndefined();
  });

  it('post the message to the chat, and say whether Telegram took it', async () => {
    const telegram = fakeTelegram();
    expect(await sendTelegram(CONFIG, 'hello', telegram.send)).toBe(true);
    expect(telegram.sent).toEqual([{ url: 'https://api.telegram.org/bot123:abc/sendMessage', body: expect.objectContaining({ chat_id: '-100200', text: 'hello' }) }]);
    expect(await sendTelegram(CONFIG, 'hello', fakeTelegram(401).send)).toBe(false);
    expect(await sendTelegram(CONFIG, 'hello', () => Promise.reject(new TypeError('fetch failed')))).toBe(false);
  });

  it("report a failed query by the database's message, never the values it was given", () => {
    const cause = Object.assign(new Error('null value in column "name" violates not-null constraint'), { code: '23502' });
    const error = new DrizzleQueryError('insert into "guest_order" ("guest_name", "note") values ($1, $2)', ['Arta Hoxha', 'allergic to nuts'], cause);
    const line = describeError(error);
    expect(line).toBe('Error: null value in column "name" violates not-null constraint [23502]');
    expect(line).not.toMatch(/Arta|nuts/);
    expect(describeError(new TypeError('x is undefined\n    at stack'))).toBe('TypeError: x is undefined');
  });

  it('send the same error on the same route once every 15 minutes', async () => {
    const telegram = fakeTelegram();
    let now = 0;
    const tasks: Promise<unknown>[] = [];
    const alert = serverErrorAlerts(CONFIG, { send: telegram.send, now: () => now, defer: (task) => tasks.push(task) })!;
    const where = { method: 'POST', route: '/api/guest/:slug/t/:qrToken/orders' };

    alert(new TypeError('boom'), where);
    alert(new TypeError('boom again'), where);
    now += 14 * 60_000;
    alert(new TypeError('boom'), where);
    alert(new RangeError('other'), where);
    alert(new TypeError('boom'), { method: 'GET', route: '/api/staff/board' });
    now += 2 * 60_000;
    alert(new TypeError('boom'), where);
    await Promise.all(tasks);

    expect(telegram.sent.map((m) => m.body.text.split('\n').slice(1).join(' | '))).toEqual([
      'POST /api/guest/:slug/t/:qrToken/orders | TypeError: boom',
      'POST /api/guest/:slug/t/:qrToken/orders | RangeError: other',
      'GET /api/staff/board | TypeError: boom',
      'POST /api/guest/:slug/t/:qrToken/orders | TypeError: boom',
    ]);
  });

  it('cover bugs only, named by the route pattern rather than the address with its codes', async () => {
    const reported: Parameters<ServerErrorAlert>[] = [];
    const app = new Hono().basePath('/api');
    app.get('/guest/:slug/t/:qrToken/orders/:id', () => {
      throw new TypeError('cannot read properties of undefined');
    });
    app.get('/staff/board', () => {
      throw new ApiError(404, 'not_found');
    });
    app.onError(errorHandler((error, c) => reported.push([error, { method: c.req.method, route: c.req.routePath }])));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await app.request('/api/guest/tave/t/secret-code/orders/123')).status).toBe(500);
    expect((await app.request('/api/staff/board')).status).toBe(404);
    expect(reported).toEqual([[expect.any(TypeError), { method: 'GET', route: '/api/guest/:slug/t/:qrToken/orders/:id' }]]);
  });
});
