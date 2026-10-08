import { z } from 'zod';
import { LANGUAGES, STAFF_ROLES } from './types';

/*
 * Request bodies the API accepts. Unknown fields are dropped, so a body can never smuggle in a
 * venue_id: the venue always comes from the signed-in session.
 */

const email = z.string().trim().toLowerCase().pipe(z.email().max(200));

export const loginInput = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const passwordChangeInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

export const newStaffInput = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  role: z.enum(STAFF_ROLES),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Photos are stored as https URLs (Vercel Blob) or paths on our own site. */
const imageUrl = z
  .string()
  .max(2000)
  .refine((v) => v.startsWith('https://') || (v.startsWith('/') && !v.startsWith('//')), 'image_url')
  .nullable();

export const venueSettingsInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    logoUrl: imageUrl,
    coverUrl: imageUrl,
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    languages: z
      .array(z.enum(LANGUAGES))
      .min(1)
      .refine((list) => new Set(list).size === list.length, 'duplicate_language'),
    defaultLanguage: z.enum(LANGUAGES),
    timezone: z.string().refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'unknown_timezone'),
    openingHours: z
      .array(z.object({ day: z.number().int().min(0).max(6), open: z.boolean(), from: hhmm, to: hhmm }))
      .length(7)
      .refine((days) => new Set(days.map((d) => d.day)).size === 7, 'each_day_once'),
  })
  .refine((v) => v.languages.includes(v.defaultLanguage), { path: ['defaultLanguage'], message: 'default_language_not_offered' });

export type LoginInput = z.infer<typeof loginInput>;
export type PasswordChangeInput = z.infer<typeof passwordChangeInput>;
export type NewStaffInput = z.infer<typeof newStaffInput>;
export type VenueSettingsInput = z.infer<typeof venueSettingsInput>;
