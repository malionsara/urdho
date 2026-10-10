import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import type { ContentBlock } from './claude';

/*
 * What a restaurant sends, ready for Claude: photos of the paper menu (from WhatsApp, a phone),
 * a PDF, the link to their current web or QR menu, or a spreadsheet exported as CSV. A folder
 * means every menu file in it, in name order (page-1.jpg, page-2.jpg …).
 */

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface MenuSource {
  /** How the source is named to Claude and in the draft ("photo page-1.jpg", "web page https://…"). */
  label: string;
  blocks: ContentBlock[];
}

export class SourceError extends Error {}

const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const TEXT = new Set(['.csv', '.tsv', '.txt', '.md', '.json']);
const HTML = new Set(['.html', '.htm']);
const ADVICE: Record<string, string> = {
  '.heic': 'iPhone HEIC photos: send them through WhatsApp (it converts them to JPEG) or export as JPEG.',
  '.xlsx': 'Excel files: save as CSV (File → Save as → CSV UTF-8) and import that.',
  '.xls': 'Excel files: save as CSV (File → Save as → CSV UTF-8) and import that.',
  '.docx': 'Word files: save as PDF and import that.',
  '.doc': 'Word files: save as PDF and import that.',
};

/** Claude reads images at up to 1568 px on the long side; anything bigger only costs upload time. */
const IMAGE_EDGE = 1568;
const MAX_TEXT = 120_000;

export async function imageBlock(data: Buffer): Promise<ContentBlock> {
  try {
    const jpeg = await sharp(data).rotate().resize({ width: IMAGE_EDGE, height: IMAGE_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } };
  } catch {
    throw new SourceError("couldn't be read as an image");
  }
}

function pdfBlock(data: Buffer): ContentBlock {
  if (data.length > 24 * 1024 * 1024) throw new SourceError('is over 24 MB; split the PDF or send photos of the pages');
  return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } };
}

const textBlock = (text: string): ContentBlock => ({ type: 'text', text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[cut off here]` : text });

/** The readable text of a web page: no scripts or styles, one line per block, entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/td|\/th)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\r]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function fromFile(path: string): Promise<MenuSource> {
  const ext = extname(path).toLowerCase();
  const name = basename(path);
  const data = await readFile(path);
  try {
    if (IMAGE.has(ext)) return { label: `photo ${name}`, blocks: [await imageBlock(data)] };
    if (ext === '.pdf') return { label: `PDF ${name}`, blocks: [pdfBlock(data)] };
    if (HTML.has(ext)) return { label: `web page ${name}`, blocks: [textBlock(htmlToText(data.toString('utf8')))] };
    if (TEXT.has(ext)) return { label: `file ${name}`, blocks: [textBlock(data.toString('utf8'))] };
  } catch (error) {
    if (error instanceof SourceError) throw new SourceError(`${name} ${error.message}`);
    throw error;
  }
  throw new SourceError(`${name}: ${ADVICE[ext] ?? `${ext || 'files without an extension'} can't be imported. Use photos (JPEG, PNG), PDF, CSV or a link.`}`);
}

async function fromUrl(url: string, send: Fetch): Promise<MenuSource> {
  let res: Response;
  try {
    res = await send(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; UrdhoMenuImport/1.0)' }, redirect: 'follow' });
  } catch (error) {
    throw new SourceError(`${url} couldn't be reached (${(error as Error).message})`);
  }
  if (!res.ok) throw new SourceError(`${url} answered ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  const data = Buffer.from(await res.arrayBuffer());
  if (type.startsWith('image/')) return { label: `photo ${url}`, blocks: [await imageBlock(data)] };
  if (type.includes('pdf')) return { label: `PDF ${url}`, blocks: [pdfBlock(data)] };
  const text = type.includes('html') ? htmlToText(data.toString('utf8')) : data.toString('utf8');
  // Menus drawn by JavaScript, or shown as pictures, leave almost no text in the page itself.
  if (text.length < 300) throw new SourceError(`${url} has almost no text in the page (its menu is probably drawn by JavaScript or shown as pictures). Take screenshots of it and import those instead.`);
  return { label: `web page ${url}`, blocks: [textBlock(text)] };
}

/** Everything the arguments point to, in order. Folders expand to their menu files, sorted by name. */
export async function readSources(args: string[], { fetch: send = fetch }: { fetch?: Fetch } = {}): Promise<MenuSource[]> {
  const sources: MenuSource[] = [];
  for (const arg of args) {
    if (/^https?:\/\//i.test(arg)) {
      sources.push(await fromUrl(arg, send));
      continue;
    }
    const info = await stat(arg).catch(() => undefined);
    if (!info) throw new SourceError(`${arg}: no such file or folder`);
    if (info.isDirectory()) {
      const names = (await readdir(arg)).filter((n) => !n.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const files = names.filter((n) => [...IMAGE, ...TEXT, ...HTML, '.pdf'].includes(extname(n).toLowerCase()));
      if (files.length === 0) throw new SourceError(`${arg}: no photos, PDFs or CSV files in this folder`);
      for (const file of files) sources.push(await fromFile(join(arg, file)));
    } else {
      sources.push(await fromFile(arg));
    }
  }
  if (sources.length === 0) throw new SourceError('Nothing to import: give photos, PDFs, CSV files, folders or links.');
  return sources;
}
