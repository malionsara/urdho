import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Language, LocalizedText } from '../../shared/types';
import type { Db } from '../db/client';
import { translation } from '../db/schema';

type Executor = Pick<Db, 'select' | 'insert' | 'delete'>;
type Entity = (typeof translation.$inferInsert)['entityType'];
type Field = (typeof translation.$inferInsert)['field'];

export interface Texts {
  name: LocalizedText;
  description: LocalizedText;
}

/** Every text of the given rows, as { id → { name: { sq, en, … }, description: { … } } }. */
export async function readTexts(db: Executor, venueId: string, entityType: Entity, ids: string[]): Promise<Map<string, Texts>> {
  const texts = new Map<string, Texts>(ids.map((id) => [id, { name: {}, description: {} }]));
  if (ids.length === 0) return texts;
  const rows = await db
    .select({ entityId: translation.entityId, field: translation.field, lang: translation.lang, text: translation.text })
    .from(translation)
    .where(and(eq(translation.venueId, venueId), eq(translation.entityType, entityType), inArray(translation.entityId, ids)));
  for (const row of rows) {
    const entry = texts.get(row.entityId);
    if (entry) entry[row.field][row.lang] = row.text;
  }
  return texts;
}

/** Replaces one field's texts: languages present are written, languages left out are removed. */
export async function writeTexts(db: Executor, venueId: string, entityType: Entity, entityId: string, field: Field, text: LocalizedText) {
  const langs = Object.keys(text) as Language[];
  await db
    .delete(translation)
    .where(
      and(
        eq(translation.venueId, venueId),
        eq(translation.entityType, entityType),
        eq(translation.entityId, entityId),
        eq(translation.field, field),
        langs.length > 0 ? notInArray(translation.lang, langs) : undefined,
      ),
    );
  if (langs.length === 0) return;
  await db
    .insert(translation)
    .values(langs.map((lang) => ({ venueId, entityType, entityId, field, lang, text: text[lang]! })))
    .onConflictDoUpdate({
      target: [translation.entityType, translation.entityId, translation.field, translation.lang],
      set: { text: sql`excluded.text` },
    });
}
