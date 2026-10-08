import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { lineTotalLek } from '@shared/pricing';
import type { Language, LocalizedText, MenuItem } from '@shared/types';
import i18n, { localize } from '../i18n';
import type { LoadedMenu } from './api';

export interface BasketLine {
  id: string;
  itemId: string;
  qty: number;
  optionIds: string[];
}

interface StoredBasket {
  lines: BasketLine[];
  note: string;
  /** Retry key for the next order: stays the same until an order with it succeeds. */
  clientRef: string;
}

interface GuestContextValue {
  menu: LoadedMenu;
  /** Path prefix for this table, e.g. /demo/t/demo-4 */
  base: string;
  slug: string;
  qrToken: string;
  itemsById: Map<string, MenuItem>;
  lang: Language;
  setLang: (lang: Language) => void;
  /** A venue-entered text in the guest's language. */
  text: (value: LocalizedText) => string;
  basket: {
    lines: BasketLine[];
    note: string;
    clientRef: string;
    count: number;
    totalLek: number;
    quantityOf: (itemId: string) => number;
    add: (itemId: string, optionIds: string[], qty: number) => void;
    replace: (lineId: string, optionIds: string[], qty: number) => void;
    setQty: (lineId: string, qty: number) => void;
    /** Drops every line of these dishes, e.g. ones that sold out while the guest was ordering. */
    removeItems: (itemIds: string[]) => void;
    setNote: (note: string) => void;
    clear: () => void;
  };
  toast: { message: string | null; id: number; show: (message: string) => void };
}

const GuestContext = createContext<GuestContextValue | null>(null);

export function useGuest(): GuestContextValue {
  const value = useContext(GuestContext);
  if (!value) throw new Error('useGuest must be used inside GuestProvider');
  return value;
}

const LANG_KEY = 'urdho-lang';

function emptyBasket(): StoredBasket {
  return { lines: [], note: '', clientRef: crypto.randomUUID() };
}

function readJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback();
  } catch {
    return fallback();
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the basket still works for this page view.
  }
}

function initialLanguage(menu: LoadedMenu): Language {
  const { languages, defaultLanguage } = menu.venue;
  try {
    const stored = localStorage.getItem(LANG_KEY) as Language | null;
    if (stored && languages.includes(stored)) return stored;
  } catch {
    // ignore
  }
  // Tourists get their own language when the venue offers it; everyone else gets the venue default.
  const browser = navigator.language.slice(0, 2) as Language;
  return languages.includes(browser) ? browser : defaultLanguage;
}

const sameOptions = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function GuestProvider({ menu, slug, qrToken, children }: { menu: LoadedMenu; slug: string; qrToken: string; children: ReactNode }) {
  const basketKey = `urdho-basket:${slug}:${qrToken}`;
  const [lang, setLangState] = useState<Language>(() => initialLanguage(menu));
  const [stored, setStored] = useState<StoredBasket>(() => readJson(basketKey, emptyBasket));
  const [toast, setToast] = useState<{ message: string | null; id: number }>({ message: null, id: 0 });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Before paint, so guests never see a flash of the other language.
  useLayoutEffect(() => {
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => writeJson(basketKey, stored), [basketKey, stored]);

  const itemsById = useMemo(
    () => new Map(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i] as const))),
    [menu],
  );

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const showToast = useCallback((message: string) => {
    setToast((current) => ({ message, id: current.id + 1 }));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((current) => ({ ...current, message: null })), 2400);
  }, []);

  const basket = useMemo<GuestContextValue['basket']>(() => {
    // Lines whose item left the menu are dropped from the count and total.
    const live = stored.lines.filter((l) => itemsById.has(l.itemId));
    return {
      lines: live,
      note: stored.note,
      clientRef: stored.clientRef,
      count: live.reduce((n, l) => n + l.qty, 0),
      totalLek: live.reduce((sum, l) => sum + lineTotalLek(itemsById.get(l.itemId)!, l.optionIds, l.qty), 0),
      quantityOf: (itemId) => live.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0),
      add: (itemId, optionIds, qty) =>
        setStored((b) => {
          const same = b.lines.find((l) => l.itemId === itemId && sameOptions(l.optionIds, optionIds));
          const lines = same
            ? b.lines.map((l) => (l === same ? { ...l, qty: l.qty + qty } : l))
            : [...b.lines, { id: crypto.randomUUID(), itemId, optionIds, qty }];
          return { ...b, lines };
        }),
      replace: (lineId, optionIds, qty) =>
        setStored((b) => ({ ...b, lines: b.lines.map((l) => (l.id === lineId ? { ...l, optionIds, qty } : l)) })),
      setQty: (lineId, qty) =>
        setStored((b) => ({
          ...b,
          lines: qty <= 0 ? b.lines.filter((l) => l.id !== lineId) : b.lines.map((l) => (l.id === lineId ? { ...l, qty } : l)),
        })),
      removeItems: (itemIds) => setStored((b) => ({ ...b, lines: b.lines.filter((l) => !itemIds.includes(l.itemId)) })),
      setNote: (note) => setStored((b) => ({ ...b, note })),
      clear: () => setStored(emptyBasket()),
    };
  }, [stored, itemsById]);

  const value = useMemo<GuestContextValue>(
    () => ({
      menu,
      base: `/${slug}/t/${qrToken}`,
      slug,
      qrToken,
      itemsById,
      lang,
      setLang,
      text: (v) => localize(v, lang, menu.venue.defaultLanguage),
      basket,
      toast: { ...toast, show: showToast },
    }),
    [menu, slug, qrToken, itemsById, lang, setLang, basket, toast, showToast],
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}
