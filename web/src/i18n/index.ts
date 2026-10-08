import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language, LocalizedText } from '@shared/types';
import en from './en.json';
import sq from './sq.json';

// Italian and German UI strings arrive after launch; until then they fall back to English.
export const UI_LANGUAGES: Language[] = ['sq', 'en', 'it', 'de'];

/** Language for screens shown before a venue's languages are known (loading, errors). */
function startLanguage(): Language {
  try {
    const stored = localStorage.getItem('urdho-lang');
    if (stored && (UI_LANGUAGES as string[]).includes(stored)) return stored as Language;
  } catch {
    // ignore
  }
  const browser = navigator.language.slice(0, 2);
  return (UI_LANGUAGES as string[]).includes(browser) ? (browser as Language) : 'sq';
}

void i18n.use(initReactI18next).init({
  resources: { sq: { translation: sq }, en: { translation: en } },
  lng: startLanguage(),
  fallbackLng: { it: ['en'], de: ['en'], default: ['sq'] },
  supportedLngs: UI_LANGUAGES,
  interpolation: { escapeValue: false },
});

/** Picks a venue-entered text in the guest's language, falling back to the venue default, then any. */
export function localize(text: LocalizedText, lang: Language, fallback: Language): string {
  return text[lang] ?? text[fallback] ?? Object.values(text).find(Boolean) ?? '';
}

export default i18n;
