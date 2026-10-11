import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { callTool, ClaudeError } from './claude';
import { DraftError, planImport, previewText, type DraftItem, type MenuDraft } from './draft';
import { htmlToText, readSources, SourceError } from './sources';

const t = (sq: string, en = sq) => ({ sq, en });
const dish = (overrides: Partial<DraftItem> = {}): DraftItem => ({
  name: t('Tavë kosi'),
  description: t('Mish qengji me kos', 'Lamb baked with yoghurt'),
  price: 850,
  tags: [],
  allergens: [],
  optionGroups: [],
  ...overrides,
});
const draft = (items: DraftItem[], overrides: Partial<MenuDraft> = {}): MenuDraft => ({ currency: 'ALL', categories: [{ name: t('Gatime', 'Mains'), items }], warnings: [], ...overrides });

describe('turning a draft into an import', () => {
  it('keeps dishes as read, in whole lekë, hidden from guests', () => {
    const plan = planImport(draft([dish({ price: 850.4, tags: ['vegetarian', 'vegetarian', 'unknown'], allergens: ['milk', 'gluten-ish'] })]));
    expect(plan.input.visible).toBe(false);
    expect(plan.input.categories).toEqual([
      {
        name: { sq: 'Gatime', en: 'Mains' },
        items: [
          expect.objectContaining({ name: { sq: 'Tavë kosi', en: 'Tavë kosi' }, priceLek: 850, tags: ['vegetarian'], allergens: ['milk'], photoUrl: null, available: true }),
        ],
      },
    ]);
  });

  it('sets aside dishes without a price instead of selling them for nothing', () => {
    const plan = planImport(draft([dish(), dish({ name: t('Peshk i ditës', 'Catch of the day'), price: null }), dish({ name: t('Ujë'), price: 0 })]));
    expect(plan.input.categories[0]!.items).toHaveLength(1);
    expect(plan.skipped).toEqual(['Gatime / Peshk i ditës: no price on the menu', 'Gatime / Ujë: no price on the menu']);
  });

  it('turns euro into lekë only with a rate, and refuses other currencies', () => {
    const euro = draft([dish({ price: 6.5, optionGroups: [{ name: t('Madhësia', 'Size'), minSelect: 1, maxSelect: 1, options: [{ name: t('E madhe', 'Large'), priceDelta: 1.5 }] }] })], { currency: 'EUR' });
    expect(() => planImport(euro)).toThrow(DraftError);
    const item = planImport(euro, { eurRate: 100 }).input.categories[0]!.items[0]!;
    expect(item.priceLek).toBe(650);
    expect(item.optionGroups[0]!.options[0]!.priceDeltaLek).toBe(150);
    expect(() => planImport(draft([dish()], { currency: 'other' }))).toThrow(/other than lekë or euro/);
  });

  it('makes choices consistent: never more to pick than there are options', () => {
    const item = planImport(
      draft([dish({ optionGroups: [{ name: t('Shtesa', 'Extras'), minSelect: 3, maxSelect: 9, options: [{ name: t('Patate', 'Chips'), priceDelta: 150 }, { name: t('Sallatë', 'Salad'), priceDelta: null }] }, { name: t('Bosh', 'Empty'), minSelect: 1, maxSelect: 1, options: [] }] })]),
    ).input.categories[0]!.items[0]!;
    expect(item.optionGroups).toEqual([
      expect.objectContaining({ minSelect: 2, maxSelect: 2, options: [expect.objectContaining({ priceDeltaLek: 150 }), expect.objectContaining({ priceDeltaLek: 0 })] }),
    ]);
  });

  it('refuses a menu with nothing to sell, and shows the rest for checking', () => {
    expect(() => planImport(draft([dish({ price: null })]))).toThrow(/No dishes with a price/);
    const plan = planImport(draft([dish({ optionGroups: [{ name: t('Porcioni', 'Portion'), minSelect: 1, maxSelect: 1, options: [{ name: t('6 copë', '6 pieces'), priceDelta: 0 }, { name: t('10 copë', '10 pieces'), priceDelta: 250 }] }] })]));
    const preview = previewText(plan, ['Service charge 10% printed on the menu']);
    expect(preview).toContain('Gatime · Mains (1)');
    expect(preview).toContain('850 L');
    expect(preview).toContain('Porcioni · Portion (choose): 6 copë · 6 pieces, 10 copë · 10 pieces +250 L');
    expect(preview).toContain('Service charge 10% printed on the menu');
  });
});

/** A fake Anthropic API answering with these server-sent events. */
function sse(events: object[], status = 200) {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new Blob([body]).stream(), { status, headers: { 'content-type': 'text/event-stream' } });
}
const call = (send: (url: string, init: RequestInit) => Promise<Response>) =>
  callTool<{ ok: boolean }>({ apiKey: 'test-key', system: 's', content: [{ type: 'text', text: 'hi' }], tool: { name: 'save_menu', description: 'd', input_schema: {} }, fetch: send, sleep: async () => {} });

describe('reading Claude’s answer', () => {
  it('puts the streamed tool input back together, with the model and tokens used', async () => {
    let request: { headers: Record<string, string>; body: { tool_choice: unknown; tools: { name: string }[]; stream: boolean } } | undefined;
    const result = await call(async (_url, init) => {
      request = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return sse([
        { type: 'message_start', message: { model: 'claude-test', usage: { input_tokens: 1200 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"o' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'k": true}' } },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 30 } },
        { type: 'message_stop' },
      ]);
    });
    expect(result).toEqual({ input: { ok: true }, model: 'claude-test', usage: { inputTokens: 1200, outputTokens: 30 } });
    expect(request?.headers['x-api-key']).toBe('test-key');
    expect(request?.body).toMatchObject({ stream: true, tool_choice: { type: 'auto' }, tools: [{ name: 'save_menu' }] });
  });

  it('quotes Claude when it answers in words instead of with the menu', async () => {
    const words = sse([
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'I cannot read this photo:' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' it is too blurry.' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]);
    await expect(call(async () => words)).rejects.toThrow('Claude returned no menu, only this: "I cannot read this photo: it is too blurry."');
  });

  it('says when the menu was too long for one answer', async () => {
    await expect(call(async () => sse([{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"o' } }, { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }]))).rejects.toThrow(/too long/);
  });

  it('tries again when the API is busy, and reports a wrong key plainly', async () => {
    let calls = 0;
    const busyThenFine = async () => (++calls === 1 ? Response.json({ error: { message: 'Overloaded' } }, { status: 529 }) : sse([{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"ok":true}' } }]));
    expect((await call(busyThenFine)).input).toEqual({ ok: true });
    expect(calls).toBe(2);
    await expect(call(async () => Response.json({ error: { message: 'invalid x-api-key' } }, { status: 401 }))).rejects.toThrow(new ClaudeError('Claude answered 401: invalid x-api-key'));
  });
});

describe('what a restaurant sends', () => {
  it('reads a web menu as text, without its scripts and styles', () => {
    expect(htmlToText('<style>.x{}</style><h2>Pije</h2><ul><li>Kafe&nbsp;espresso <b>100 L</b></li><li>Raki &amp; meze</li></ul><script>alert(1)</script>')).toBe('Pije\nKafe espresso 100 L\nRaki & meze');
  });

  it('takes a folder of photos in page order, turned upright and sized for Claude', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'urdho-menu-'));
    const photo = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    for (const name of ['page-10.jpg', 'page-2.jpg', 'page-1.jpg']) writeFileSync(join(dir, name), photo);
    writeFileSync(join(dir, 'notes.xlsx'), 'not a menu file');
    const sources = await readSources([dir]);
    expect(sources.map((s) => s.label)).toEqual(['photo page-1.jpg', 'photo page-2.jpg', 'photo page-10.jpg']);
    const block = sources[0]!.blocks[0]!;
    if (block.type !== 'image') throw new Error('expected an image');
    const meta = await sharp(Buffer.from(block.source.data, 'base64')).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1176, 1568, 'jpeg']);
  });

  it('explains what to send instead of an Excel file or a menu page drawn by JavaScript', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'urdho-menu-'));
    writeFileSync(join(dir, 'menu.xlsx'), 'x');
    await expect(readSources([join(dir, 'menu.xlsx')])).rejects.toThrow(/save as CSV/);
    const empty = async () => new Response('<html><body><div id="app"></div><script src="/app.js"></script></body></html>', { headers: { 'content-type': 'text/html' } });
    await expect(readSources(['https://menu.example/bar'], { fetch: empty })).rejects.toThrow(SourceError);
    await expect(readSources(['https://menu.example/bar'], { fetch: empty })).rejects.toThrow(/screenshots/);
  });
});
