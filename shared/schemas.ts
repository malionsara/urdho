import { z } from 'zod';
import { ALLERGENS } from './allergens';
import { ITEM_TAGS, LANGUAGES, PAYMENT_METHODS, STAFF_ROLES, type Language } from './types';

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

/** The venue the health check (`pnpm smoke`) orders from; no real venue may take its address. */
export const HEALTH_CHECK_SLUG = 'urdho-check';

/** Addresses the app itself uses at the top level, so a venue can't be called them. */
export const RESERVED_SLUGS = ['api', 'assets', 'demo', 'icons', 'staff', 'uploads', HEALTH_CHECK_SLUG];

/** A new pilot venue with its owner (operator only: pnpm venue:create). */
export const newVenueInput = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens, e.g. tave-raki')
    .max(40)
    .refine((slug) => !RESERVED_SLUGS.includes(slug), 'that address is used by the app itself'),
  ownerName: z.string().trim().min(1).max(80),
  ownerEmail: email,
  tables: z.coerce.number().int().min(1).max(200).default(6),
});

export type NewVenueInput = z.infer<typeof newVenueInput>;

/** A forgotten password (operator only: pnpm staff:reset-password). */
export const staffPasswordResetInput = z.object({ email });

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

/* Menu ------------------------------------------------------------------------ */

/** A text per language; empty strings are dropped, so a cleared field removes that language. */
const localized = (max: number) =>
  z
    .partialRecord(z.enum(LANGUAGES), z.string().trim().max(max))
    .transform((text) => Object.fromEntries(Object.entries(text).filter(([, value]) => value)) as Partial<Record<Language, string>>);

const uniqueList = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .refine((list) => new Set(list).size === list.length, 'duplicate');

export const categoryInput = z.object({
  name: localized(60),
});

export const categoryUpdateInput = z.object({
  name: localized(60).optional(),
  active: z.boolean().optional(),
});

const optionInput = z.object({
  /** Present for an option that already exists; omitted for a new one. */
  id: z.uuid().optional(),
  name: localized(80),
  priceDeltaLek: z.number().int().min(-100_000).max(100_000),
  available: z.boolean(),
});

const optionGroupInput = z
  .object({
    id: z.uuid().optional(),
    name: localized(80),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z.array(optionInput).min(1).max(30),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { path: ['minSelect'], message: 'min_above_max' })
  .refine((g) => g.maxSelect <= g.options.length, { path: ['maxSelect'], message: 'max_above_option_count' });

/** A whole dish as the menu manager saves it: texts, price, flags, and its option groups in order. */
export const menuItemInput = z.object({
  categoryId: z.uuid(),
  name: localized(120),
  description: localized(500),
  priceLek: z.number().int().min(0).max(1_000_000),
  photoUrl: imageUrl,
  available: z.boolean(),
  suggestInBasket: z.boolean(),
  tags: uniqueList(z.enum(ITEM_TAGS), ITEM_TAGS.length),
  allergens: uniqueList(z.enum(ALLERGENS), ALLERGENS.length),
  optionGroups: z.array(optionGroupInput).max(10),
});

/**
 * A whole menu at once (operator only: pnpm menu:import), dishes exactly as the menu manager saves
 * them, minus their category id. Hidden from guests unless `visible`, until someone has checked it.
 */
export const menuImportInput = z.object({
  visible: z.boolean().default(false),
  categories: z
    .array(categoryInput.extend({ items: z.array(menuItemInput.omit({ categoryId: true })).min(1).max(300) }))
    .min(1)
    .max(60),
});

export const availabilityInput = z.object({ available: z.boolean() });

export const PHOTO_KINDS = ['dish', 'cover', 'logo'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

/* Ordering ------------------------------------------------------------------- */

/** What a guest's phone sends. No prices: the server works them out from the menu. */
export const placeOrderInput = z.object({
  /** Made on the phone; sending the same order again (a retry) returns the first one. */
  clientRef: z.string().min(8).max(100),
  guestName: z.string().trim().max(40),
  note: z.string().trim().max(280),
  lines: z
    .array(
      z.object({
        itemId: z.uuid(),
        qty: z.number().int().min(1).max(20),
        optionIds: uniqueList(z.uuid(), 30),
      }),
    )
    .min(1)
    .max(30),
});

/** Staff move an order along the board, or cancel it. */
export const orderStatusInput = z.object({
  status: z.enum(['preparing', 'served', 'cancelled']),
});

export const payInput = z.object({
  method: z.enum(PAYMENT_METHODS),
});

export type PlaceOrderInput = z.infer<typeof placeOrderInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type MenuItemInput = z.infer<typeof menuItemInput>;
export type MenuImportInput = z.infer<typeof menuImportInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type PasswordChangeInput = z.infer<typeof passwordChangeInput>;
export type NewStaffInput = z.infer<typeof newStaffInput>;
export type VenueSettingsInput = z.infer<typeof venueSettingsInput>;
