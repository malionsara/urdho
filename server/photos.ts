import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import type { PhotoKind } from '../shared/schemas';
import { ApiError } from './http';

/*
 * Uploaded photos: checked to be an image, turned upright, stripped of metadata (GPS and so on),
 * and saved as WebP in two sizes, name.webp and name-<small>.webp, the convention the web app's
 * srcset already follows.
 */

/** Vercel functions accept bodies up to 4.5 MB; the web app shrinks photos well below this first. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const SIZES: Record<PhotoKind, { large: number; small?: number; square?: boolean }> = {
  dish: { large: 800, small: 400 },
  cover: { large: 1200, small: 600 },
  logo: { large: 400, square: true },
};

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'heif', 'tiff']);

export interface PhotoStorage {
  /** Saves a file and returns the URL it is served from. */
  put(path: string, data: Buffer, contentType: string): Promise<string>;
}

export interface ProcessedPhoto {
  suffix: string;
  data: Buffer;
}

export async function processPhoto(input: Buffer, kind: PhotoKind): Promise<ProcessedPhoto[]> {
  const meta = await sharp(input, { limitInputPixels: 50_000_000 })
    .metadata()
    .catch(() => null);
  if (!meta?.format || !ACCEPTED_FORMATS.has(meta.format)) throw new ApiError(400, 'not_an_image');

  const { large, small, square } = SIZES[kind];
  const render = (width: number) =>
    sharp(input, { limitInputPixels: 50_000_000 })
      .rotate() // apply the camera's orientation before the metadata is dropped
      .resize(square ? { width, height: width, fit: 'cover' } : { width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

  const variants: ProcessedPhoto[] = [{ suffix: '', data: await render(large) }];
  if (small) variants.push({ suffix: `-${small}`, data: await render(small) });
  return variants;
}

/** Local development: files in web/public/uploads, which the Vite dev server serves at /uploads. */
export function diskStorage(directory: string, urlPrefix: string): PhotoStorage {
  return {
    async put(path, data) {
      const file = join(directory, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
      return `${urlPrefix}/${path}`;
    },
  };
}

/** Production: Vercel Blob. Paths contain a random id, so nothing is ever overwritten. */
export function blobStorage(token: string): PhotoStorage {
  return {
    async put(path, data, contentType) {
      const blob = await put(path, data, { access: 'public', contentType, token, addRandomSuffix: false });
      return blob.url;
    },
  };
}

export function storageFromEnv(): PhotoStorage {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? blobStorage(token) : diskStorage(fileURLToPath(new URL('../web/public/uploads', import.meta.url)), '/uploads');
}
