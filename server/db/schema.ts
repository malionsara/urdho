import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { ALLERGENS } from '../../shared/allergens';
import { ITEM_TAGS, LANGUAGES, ORDER_STATUSES, PAYMENT_METHODS, STAFF_ROLES } from '../../shared/types';
import type { LocalizedText, OpeningDay } from '../../shared/types';

/*
 * The data model from docs/SPEC.md.
 *
 * Tenancy: every tenant-owned table has venue_id. A child row points at its parent through
 * (parent_id, venue_id) together, against a unique (id, venue_id) on the parent, so the database
 * itself refuses to link one venue's rows to another venue's.
 *
 * Money is whole lekë in integer columns. Menu rows are archived (archived_at), never deleted,
 * so past orders always resolve.
 */

export const language = pgEnum('language', LANGUAGES);
export const staffRole = pgEnum('staff_role', STAFF_ROLES);
export const itemTag = pgEnum('item_tag', ITEM_TAGS);
export const allergen = pgEnum('allergen', ALLERGENS);
export const sessionStatus = pgEnum('session_status', ['open', 'closed']);
export const orderStatus = pgEnum('order_status', ORDER_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatus = pgEnum('payment_status', ['pending', 'confirmed', 'refunded', 'failed']);
export const translatedEntity = pgEnum('translated_entity', ['menu_category', 'menu_item', 'option_group', 'menu_option']);
export const translatedField = pgEnum('translated_field', ['name', 'description']);

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const archivedAt = () => timestamp('archived_at', { withTimezone: true });
const sortOrder = () => integer('sort_order').notNull().default(0);

/* Venue --------------------------------------------------------------------- */

export const venue = pgTable(
  'venue',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logoUrl: text('logo_url'),
    coverUrl: text('cover_url'),
    brandColor: text('brand_color').notNull().default('#C8432A'),
    languages: language('languages').array().notNull().default(sql`'{sq,en}'::language[]`),
    defaultLanguage: language('default_language').notNull().default('sq'),
    timezone: text('timezone').notNull().default('Europe/Tirane'),
    openingHours: jsonb('opening_hours').$type<OpeningDay[]>().notNull(),
    currency: text('currency').notNull().default('ALL'),
    plan: text('plan').notNull().default('pilot'),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    check('venue_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('venue_brand_color_hex', sql`${t.brandColor} ~ '^#[0-9A-Fa-f]{6}$'`),
    check('venue_default_language_offered', sql`${t.defaultLanguage} = ANY (${t.languages})`),
  ],
);

const venueId = () =>
  uuid('venue_id')
    .notNull()
    .references(() => venue.id, { onDelete: 'cascade' });

/* Staff --------------------------------------------------------------------- */

export const staffUser = pgTable(
  'staff_user',
  {
    id: id(),
    venueId: venueId(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: staffRole('role').notNull(),
    /** Set for accounts made with a temporary password; cleared when they choose their own. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    // One venue per account: an email address signs in to exactly one venue.
    uniqueIndex('staff_user_email_unique').on(sql`lower(${t.email})`),
    unique('staff_user_id_venue').on(t.id, t.venueId),
  ],
);

/** A signed-in device. Only the SHA-256 of the cookie's token is stored; removing the user signs them out. */
export const staffSession = pgTable(
  'staff_session',
  {
    id: id(),
    venueId: venueId(),
    staffUserId: uuid('staff_user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({ name: 'staff_session_user_fk', columns: [t.staffUserId, t.venueId], foreignColumns: [staffUser.id, staffUser.venueId] }).onDelete('cascade'),
    index('staff_session_user').on(t.venueId, t.staffUserId),
  ],
);

/* Tables -------------------------------------------------------------------- */

export const diningTable = pgTable(
  'dining_table',
  {
    id: id(),
    venueId: venueId(),
    number: integer('number').notNull(),
    label: text('label'),
    /** Random and resettable; printed in the table's QR code. */
    qrToken: text('qr_token').notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('dining_table_number').on(t.venueId, t.number),
    unique('dining_table_id_venue').on(t.id, t.venueId),
    check('dining_table_number_positive', sql`${t.number} > 0`),
  ],
);

/* Menu ---------------------------------------------------------------------- */

export const menuCategory = pgTable(
  'menu_category',
  {
    id: id(),
    venueId: venueId(),
    sortOrder: sortOrder(),
    active: boolean('active').notNull().default(true),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
  },
  (t) => [unique('menu_category_id_venue').on(t.id, t.venueId), index('menu_category_venue').on(t.venueId, t.sortOrder)],
);

export const menuItem = pgTable(
  'menu_item',
  {
    id: id(),
    venueId: venueId(),
    categoryId: uuid('category_id').notNull(),
    priceLek: integer('price_lek').notNull(),
    photoUrl: text('photo_url'),
    available: boolean('available').notNull().default(true),
    suggestInBasket: boolean('suggest_in_basket').notNull().default(false),
    tags: itemTag('tags').array().notNull().default(sql`'{}'::item_tag[]`),
    allergens: allergen('allergens').array().notNull().default(sql`'{}'::allergen[]`),
    sortOrder: sortOrder(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: 'menu_item_category_fk', columns: [t.categoryId, t.venueId], foreignColumns: [menuCategory.id, menuCategory.venueId] }),
    unique('menu_item_id_venue').on(t.id, t.venueId),
    index('menu_item_category').on(t.venueId, t.categoryId, t.sortOrder),
    check('menu_item_price_not_negative', sql`${t.priceLek} >= 0`),
  ],
);

export const optionGroup = pgTable(
  'option_group',
  {
    id: id(),
    venueId: venueId(),
    itemId: uuid('item_id').notNull(),
    minSelect: integer('min_select').notNull().default(0),
    maxSelect: integer('max_select').notNull().default(1),
    sortOrder: sortOrder(),
    archivedAt: archivedAt(),
  },
  (t) => [
    foreignKey({ name: 'option_group_item_fk', columns: [t.itemId, t.venueId], foreignColumns: [menuItem.id, menuItem.venueId] }),
    unique('option_group_id_venue').on(t.id, t.venueId),
    index('option_group_item').on(t.venueId, t.itemId),
    check('option_group_select_range', sql`${t.minSelect} >= 0 AND ${t.maxSelect} >= 1 AND ${t.minSelect} <= ${t.maxSelect}`),
  ],
);

/** Named menu_option rather than "option" so raw SQL never needs to quote it. */
export const menuOption = pgTable(
  'menu_option',
  {
    id: id(),
    venueId: venueId(),
    groupId: uuid('group_id').notNull(),
    priceDeltaLek: integer('price_delta_lek').notNull().default(0),
    available: boolean('available').notNull().default(true),
    sortOrder: sortOrder(),
    archivedAt: archivedAt(),
  },
  (t) => [
    foreignKey({ name: 'menu_option_group_fk', columns: [t.groupId, t.venueId], foreignColumns: [optionGroup.id, optionGroup.venueId] }),
    unique('menu_option_id_venue').on(t.id, t.venueId),
    index('menu_option_group').on(t.venueId, t.groupId),
  ],
);

/**
 * One row per text per language. Polymorphic, so no foreign key to the entity: the app writes and
 * archives translations together with their entity.
 */
export const translation = pgTable(
  'translation',
  {
    id: id(),
    venueId: venueId(),
    entityType: translatedEntity('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    field: translatedField('field').notNull(),
    lang: language('lang').notNull(),
    text: text('text').notNull(),
  },
  (t) => [
    unique('translation_one_text').on(t.entityType, t.entityId, t.field, t.lang),
    index('translation_venue_entity').on(t.venueId, t.entityType, t.entityId),
  ],
);

/* Service ------------------------------------------------------------------- */

export const tableSession = pgTable(
  'table_session',
  {
    id: id(),
    venueId: venueId(),
    tableId: uuid('table_id').notNull(),
    status: sessionStatus('status').notNull().default('open'),
    /** SHA-256 of the guest's session token; the token itself only lives in the guest's cookie. */
    tokenHash: text('token_hash').notNull().unique(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ name: 'table_session_table_fk', columns: [t.tableId, t.venueId], foreignColumns: [diningTable.id, diningTable.venueId] }),
    unique('table_session_id_venue').on(t.id, t.venueId),
    // Everyone at a table shares one open session.
    uniqueIndex('table_session_one_open').on(t.tableId).where(sql`${t.status} = 'open'`),
    index('table_session_venue_status').on(t.venueId, t.status),
    check('table_session_closed_at_matches_status', sql`(${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`),
  ],
);

export const guestOrder = pgTable(
  'guest_order',
  {
    id: id(),
    venueId: venueId(),
    sessionId: uuid('session_id').notNull(),
    /** Made on the guest's phone; a retried submission with the same key is the same order. */
    clientRef: text('client_ref').notNull(),
    status: orderStatus('status').notNull().default('new'),
    guestName: text('guest_name').notNull().default(''),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'guest_order_session_fk', columns: [t.sessionId, t.venueId], foreignColumns: [tableSession.id, tableSession.venueId] }),
    unique('guest_order_id_venue').on(t.id, t.venueId),
    unique('guest_order_client_ref').on(t.sessionId, t.clientRef),
    index('guest_order_board').on(t.venueId, t.status, t.createdAt),
  ],
);

export const orderItem = pgTable(
  'order_item',
  {
    id: id(),
    venueId: venueId(),
    orderId: uuid('order_id').notNull(),
    itemId: uuid('item_id').notNull(),
    /** Copied at order time in every venue language, so menu edits never change history. */
    itemName: jsonb('item_name').$type<LocalizedText>().notNull(),
    /** The line's place in the order, as the guest added it. */
    position: integer('position').notNull().default(0),
    qty: integer('qty').notNull(),
    /** The dish's own price when ordered; option prices are on order_item_option. */
    unitPriceLek: integer('unit_price_lek').notNull(),
    note: text('note').notNull().default(''),
  },
  (t) => [
    foreignKey({ name: 'order_item_order_fk', columns: [t.orderId, t.venueId], foreignColumns: [guestOrder.id, guestOrder.venueId] }).onDelete('cascade'),
    foreignKey({ name: 'order_item_item_fk', columns: [t.itemId, t.venueId], foreignColumns: [menuItem.id, menuItem.venueId] }),
    unique('order_item_id_venue').on(t.id, t.venueId),
    index('order_item_order').on(t.venueId, t.orderId),
    check('order_item_qty_positive', sql`${t.qty} > 0`),
    check('order_item_price_not_negative', sql`${t.unitPriceLek} >= 0`),
  ],
);

export const orderItemOption = pgTable(
  'order_item_option',
  {
    id: id(),
    venueId: venueId(),
    orderItemId: uuid('order_item_id').notNull(),
    optionId: uuid('option_id').notNull(),
    optionName: jsonb('option_name').$type<LocalizedText>().notNull(),
    position: integer('position').notNull().default(0),
    priceDeltaLek: integer('price_delta_lek').notNull(),
  },
  (t) => [
    foreignKey({ name: 'order_item_option_line_fk', columns: [t.orderItemId, t.venueId], foreignColumns: [orderItem.id, orderItem.venueId] }).onDelete(
      'cascade',
    ),
    foreignKey({ name: 'order_item_option_option_fk', columns: [t.optionId, t.venueId], foreignColumns: [menuOption.id, menuOption.venueId] }),
    index('order_item_option_line').on(t.venueId, t.orderItemId),
  ],
);

export const serviceCall = pgTable(
  'service_call',
  {
    id: id(),
    venueId: venueId(),
    sessionId: uuid('session_id').notNull(),
    tableId: uuid('table_id').notNull(),
    createdAt: createdAt(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by'),
  },
  (t) => [
    foreignKey({ name: 'service_call_session_fk', columns: [t.sessionId, t.venueId], foreignColumns: [tableSession.id, tableSession.venueId] }),
    foreignKey({ name: 'service_call_table_fk', columns: [t.tableId, t.venueId], foreignColumns: [diningTable.id, diningTable.venueId] }),
    foreignKey({ name: 'service_call_staff_fk', columns: [t.acknowledgedBy, t.venueId], foreignColumns: [staffUser.id, staffUser.venueId] }),
    // A second tap on "Call the waiter" doesn't ring again while the first is unanswered.
    uniqueIndex('service_call_one_open').on(t.sessionId).where(sql`${t.acknowledgedAt} IS NULL`),
  ],
);

export const payment = pgTable(
  'payment',
  {
    id: id(),
    venueId: venueId(),
    sessionId: uuid('session_id').notNull(),
    /** "cash" in the MVP: money taken by staff outside the app, in cash or on the venue's card terminal. */
    provider: text('provider').notNull().default('cash'),
    method: paymentMethod('method').notNull(),
    amountLek: integer('amount_lek').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    providerRef: text('provider_ref'),
    createdAt: createdAt(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ name: 'payment_session_fk', columns: [t.sessionId, t.venueId], foreignColumns: [tableSession.id, tableSession.venueId] }),
    index('payment_session').on(t.venueId, t.sessionId),
    check('payment_amount_not_negative', sql`${t.amountLek} >= 0`),
  ],
);
