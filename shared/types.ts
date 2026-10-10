import type { Allergen } from './allergens';

export const LANGUAGES = ['sq', 'en', 'it', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

/** A user-facing text in each language the venue has entered. */
export type LocalizedText = Partial<Record<Language, string>>;

export const ITEM_TAGS = ['vegetarian', 'spicy', 'new'] as const;
export type ItemTag = (typeof ITEM_TAGS)[number];

export const ORDER_STATUSES = ['new', 'preparing', 'served', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface MenuOption {
  id: string;
  name: LocalizedText;
  priceDeltaLek: number;
  available: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: LocalizedText;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText;
  priceLek: number;
  photoUrl: string | null;
  available: boolean;
  suggestInBasket: boolean;
  tags: ItemTag[];
  allergens: Allergen[];
  optionGroups: MenuOptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: LocalizedText;
  items: MenuItem[];
}

export interface OpeningDay {
  /** 0 = Monday … 6 = Sunday */
  day: number;
  open: boolean;
  /** "HH:MM" in the venue's time zone */
  from: string;
  to: string;
}

/** Everything a venue sets in its settings. */
export interface Venue {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  /** Wide photo at the top of the guest menu. */
  coverUrl: string | null;
  brandColor: string;
  languages: Language[];
  defaultLanguage: Language;
  timezone: string;
  openingHours: OpeningDay[];
}

/** The owner's get-started checklist, in order. Most steps tick themselves from the venue's data. */
export const SETUP_STEPS = ['look', 'hours', 'menu', 'photos', 'staff', 'qr', 'testOrder'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
/** What the owner ticks by hand: steps the app can't see happen, and putting the list away. */
export const SETUP_MARKS = ['hours', 'qr', 'dismissed'] as const;
export type SetupMark = (typeof SETUP_MARKS)[number];

export interface VenueSetup {
  steps: {
    key: SetupStep;
    done: boolean;
    /** For dish photos: how many of the guests' dishes have one. */
    progress?: { done: number; total: number };
    /** For the menu: categories with dishes that guests can't see yet (e.g. just imported). */
    hiddenCategories?: number;
  }[];
  dismissed: boolean;
}

/** The part of the venue the guest app sees. */
export type GuestVenue = Pick<Venue, 'id' | 'slug' | 'name' | 'logoUrl' | 'coverUrl' | 'brandColor' | 'languages' | 'defaultLanguage'>;

export const STAFF_ROLES = ['owner', 'manager', 'waiter'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export const PAYMENT_METHODS = ['cash', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface GuestTable {
  id: string;
  number: number;
}

/** What the guest app loads after a scan. */
export interface GuestMenu {
  venue: GuestVenue;
  table: GuestTable;
  categories: MenuCategory[];
  /** False outside opening hours: guests can read the menu but not order. */
  orderingOpen: boolean;
}

/** One basket line as the guest app sends it. The server prices it. */
export interface OrderLineInput {
  itemId: string;
  qty: number;
  optionIds: string[];
}

export interface OrderInput {
  clientRef: string;
  guestName: string;
  note: string;
  lines: OrderLineInput[];
}

export interface PlacedOrderLine {
  itemName: LocalizedText;
  optionNames: LocalizedText[];
  qty: number;
  lineTotalLek: number;
}

export interface PlacedOrder {
  id: string;
  status: OrderStatus;
  createdAt: string;
  statusChangedAt: string;
  lines: PlacedOrderLine[];
  note: string;
  totalLek: number;
  /** Running bill for every order at this table session, this one included. */
  sessionTotalLek: number;
}
