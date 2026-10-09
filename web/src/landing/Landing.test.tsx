// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import appEn from '../i18n/en.json';
import appSq from '../i18n/sq.json';
import { contactLinks } from './contact';
import pageEn from './en.json';
import { Landing } from './Landing';
import pageSq from './sq.json';

const sq = { ...appSq, landing: pageSq };
const en = { ...appEn, landing: pageEn };

const keys = (tree: object, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) => (typeof value === 'object' ? keys(value as object, `${prefix}${key}.`) : [`${prefix}${key}`]));

describe('the translation files', () => {
  it("have the same keys in Albanian and English, the app's and the front page's", () => {
    expect(keys(appSq).sort()).toEqual(keys(appEn).sort());
    expect(keys(pageSq).sort()).toEqual(keys(pageEn).sort());
  });
});

describe('the contact buttons', () => {
  it('open WhatsApp and email with the first message written', () => {
    const links = contactLinks('Përshëndetje! Dua të di më shumë.', 'Urdho për lokalin tim', { whatsapp: '+355 69 123 4567', email: ' hello@example.com ' });
    expect(links.whatsapp).toBe(`https://wa.me/355691234567?text=${encodeURIComponent('Përshëndetje! Dua të di më shumë.')}`);
    expect(links.email).toBe(`mailto:hello@example.com?subject=${encodeURIComponent('Urdho për lokalin tim')}`);
  });

  it('have no link until the number and email are filled in', () => {
    expect(contactLinks('hi', 'subject', { whatsapp: '', email: '' })).toEqual({ whatsapp: null, email: null });
  });
});

describe('the front page', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

  beforeEach(() => i18n.changeLanguage('sq'));
  afterEach(cleanup);

  it('speaks Albanian, and English after a tap, and remembers the choice', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(sq.landing.hero.title);
    expect(document.title).toBe(sq.landing.title);
    expect(document.documentElement.lang).toBe('sq');

    fireEvent.click(screen.getAllByRole('button', { name: en.language.en })[0]!);
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(en.landing.hero.title) })).toBeTruthy();
    expect(document.title).toBe(en.landing.title);
    expect(localStorage.getItem('urdho-lang')).toBe('en');
  });

  it('describes every screenshot', () => {
    renderPage();
    for (const image of screen.getAllByRole('img')) expect(image.getAttribute('alt')).toBeTruthy();
  });

  it('links staff to sign-in and owners to the pilot', () => {
    renderPage();
    expect(screen.getAllByRole('link', { name: sq.landing.nav.signIn }).map((a) => a.getAttribute('href'))).toContain('/staff');
    expect(screen.getByRole('link', { name: new RegExp(sq.landing.hero.cta) }).getAttribute('href')).toBe('#pilot');
  });
});
