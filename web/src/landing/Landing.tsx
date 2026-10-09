import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import i18n from '../i18n';
import buttons from '../ui/Button.module.css';
import { Icon, type IconName } from '../ui/Icon';
import { KilimBand, KilimDiamond } from '../ui/Kilim';
import { contactLinks } from './contact';
import en from './en.json';
import styles from './Landing.module.css';
import boardEn1600 from './shots/board-en-1600.webp';
import boardEn800 from './shots/board-en-800.webp';
import boardSq1600 from './shots/board-sq-1600.webp';
import boardSq800 from './shots/board-sq-800.webp';
import itemEn from './shots/item-en.webp';
import itemSq from './shots/item-sq.webp';
import menuEn from './shots/menu-en.webp';
import menuSq from './shots/menu-sq.webp';
import statusEn from './shots/status-en.webp';
import statusSq from './shots/status-sq.webp';
import tablesEn1600 from './shots/tables-en-1600.webp';
import tablesSq1600 from './shots/tables-sq-1600.webp';
import sq from './sq.json';

/*
 * urdho.al: the front page for restaurant owners. Guests never come here (they arrive through a
 * table's code), so the page is loaded on its own and never slows ordering down. The screenshots
 * are the real app, taken from the demo venue in each language.
 */

// The page's own texts (landing.*) arrive with it, so guests' phones never download them.
i18n.addResourceBundle('sq', 'translation', { landing: sq }, true, false);
i18n.addResourceBundle('en', 'translation', { landing: en }, true, false);

type PageLanguage = 'sq' | 'en';

const SHOTS: Record<PageLanguage, { menu: string; item: string; status: string; board: [string, string]; tables: string }> = {
  sq: { menu: menuSq, item: itemSq, status: statusSq, board: [boardSq800, boardSq1600], tables: tablesSq1600 },
  en: { menu: menuEn, item: itemEn, status: statusEn, board: [boardEn800, boardEn1600], tables: tablesEn1600 },
};

const VALUES: { key: string; icon: IconName }[] = [
  { key: 'commission', icon: 'cash' },
  { key: 'pay', icon: 'card' },
  { key: 'devices', icon: 'qr' },
];

const STEPS = ['step1', 'step2', 'step3'] as const;
const STEP_SHOTS = { step1: 'menu', step2: 'item', step3: 'status' } as const;

const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'live', icon: 'receipt' },
  { key: 'call', icon: 'bell' },
  { key: 'menu', icon: 'pencil' },
  { key: 'bill', icon: 'grid' },
  { key: 'languages', icon: 'globe' },
  { key: 'brand', icon: 'printer' },
];

const FAQ = ['app', 'pay', 'need', 'commission', 'soldOut', 'menu'];

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function Landing() {
  const { t, i18n } = useTranslation();
  const lang: PageLanguage = i18n.resolvedLanguage === 'sq' ? 'sq' : 'en';
  const shots = SHOTS[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('landing.title');
    return () => {
      document.title = 'Urdho';
    };
  }, [lang, t]);

  return (
    <div className={styles.page}>
      <header className={styles.hero} id="top">
        <KilimBand height={14} />
        <nav className={styles.nav}>
          <a href="#top" className={styles.wordmark}>
            <KilimDiamond size={18} />
            Urdho
          </a>
          <div className={styles.navEnd}>
            <LanguageToggle />
            <Link to="/staff" className={cx(styles.navLink, styles.navSignIn)}>
              {t('landing.nav.signIn')}
            </Link>
            <a href="#contact" className={cx(buttons.button, buttons.primary, styles.navCta)}>
              {t('landing.nav.contact')}
            </a>
          </div>
        </nav>

        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{t('landing.hero.eyebrow')}</p>
            <h1 className={styles.heroTitle}>
              {t('landing.hero.title')} <span className={styles.accent}>{t('landing.hero.titleAccent')}</span>
            </h1>
            <p className={styles.heroLead}>{t('landing.hero.lead')}</p>
            <div className={styles.actions}>
              <a href="#pilot" className={cx(buttons.button, buttons.primary, buttons.lg)}>
                {t('landing.hero.cta')}
                <Icon name="chevronRight" size={20} strokeWidth={2.4} />
              </a>
              <a href="#how" className={cx(buttons.button, buttons.lg, styles.onInk)}>
                {t('landing.hero.secondary')}
              </a>
            </div>
            <ul className={styles.points}>
              {(['point1', 'point2', 'point3'] as const).map((key) => (
                <li key={key}>
                  <Icon name="check" size={16} strokeWidth={3} />
                  {t(`landing.hero.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.heroVisual}>
            <Tablet className={styles.heroTablet} src={shots.board[1]} srcSet={`${shots.board[0]} 800w, ${shots.board[1]} 1600w`} sizes="(min-width: 1040px) 640px, 100vw" alt={t('landing.board.alt')} />
            <Phone className={styles.heroPhone} src={shots.menu} alt={t('landing.how.step1.alt')} eager />
          </div>
        </div>
      </header>

      <main>
        <section className={styles.values}>
          <ul className={styles.valueList}>
            {VALUES.map(({ key, icon }) => (
              <li key={key} className={styles.value}>
                <span className={styles.valueIcon}>
                  <Icon name={icon} size={24} />
                </span>
                <h2 className={styles.valueTitle}>{t(`landing.values.${key}.title`)}</h2>
                <p>{t(`landing.values.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className={styles.how} aria-labelledby="how-title">
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>
              <KilimDiamond />
              {t('landing.how.eyebrow')}
            </p>
            <h2 id="how-title" className={styles.sectionTitle}>
              {t('landing.how.title')}
            </h2>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step} className={styles.step}>
                <Phone src={shots[STEP_SHOTS[step]]} alt={t(`landing.how.${step}.alt`)} className={styles.stepPhone} />
                <div className={styles.stepText}>
                  <span className={styles.stepNumber} aria-hidden>
                    {index + 1}
                  </span>
                  <h3>{t(`landing.how.${step}.title`)}</h3>
                  <p>{t(`landing.how.${step}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.board} aria-labelledby="board-title">
          <div className={styles.boardInner}>
            <div className={styles.boardText}>
              <p className={cx(styles.kicker, styles.kickerOnInk)}>
                <KilimDiamond />
                {t('landing.board.eyebrow')}
              </p>
              <h2 id="board-title" className={styles.sectionTitle}>
                {t('landing.board.title')}
              </h2>
              <p className={styles.boardLead}>{t('landing.board.lead')}</p>
            </div>
            {/* Phones and tablets see the orders board here; on a wide screen the hero already shows it, so this is the tables and their bills. */}
            <div className={cx(styles.tablet, styles.boardShot)}>
              <picture>
                <source media="(min-width: 1040px)" srcSet={shots.tables} width={1600} height={651} />
                <img src={shots.board[0]} srcSet={`${shots.board[0]} 800w, ${shots.board[1]} 1600w`} sizes="100vw" width={800} height={556} alt={t('landing.board.alt')} loading="lazy" decoding="async" />
              </picture>
            </div>
            <ul className={styles.features}>
              {FEATURES.map(({ key, icon }) => (
                <li key={key} className={styles.feature}>
                  <span className={styles.featureIcon}>
                    <Icon name={icon} size={22} />
                  </span>
                  <div>
                    <h3>{t(`landing.board.${key}.title`)}</h3>
                    <p>{t(`landing.board.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pilot" className={styles.pilot} aria-labelledby="pilot-title">
          <KilimBand height={18} />
          <div className={styles.pilotInner}>
            <div className={styles.pilotText}>
              <p className={styles.kicker}>
                <KilimDiamond />
                {t('landing.pilot.eyebrow')}
              </p>
              <h2 id="pilot-title" className={styles.sectionTitle}>
                {t('landing.pilot.title')}
              </h2>
              <p className={styles.pilotBody}>{t('landing.pilot.body')}</p>
              <h3 className={styles.includesTitle}>{t('landing.pilot.includesTitle')}</h3>
              <ul className={styles.includes}>
                {(['include1', 'include2', 'include3', 'include4'] as const).map((key) => (
                  <li key={key}>
                    <Icon name="check" size={18} strokeWidth={3} />
                    {t(`landing.pilot.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.priceCard}>
              <p className={styles.priceLabel}>{t('landing.pilot.priceLabel')}</p>
              <p className={styles.price}>{t('landing.pilot.price')}</p>
              <p className={styles.priceNote}>{t('landing.pilot.priceNote')}</p>
              <ContactButtons stacked />
            </div>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <h2 id="faq-title" className={styles.sectionTitle}>
            {t('landing.faq.title')}
          </h2>
          <div className={styles.faqList}>
            {FAQ.map((key) => (
              <details key={key} className={styles.faqItem}>
                <summary>
                  {t(`landing.faq.${key}.q`)}
                  <Icon name="plus" size={20} strokeWidth={2.4} className={styles.faqIcon} />
                </summary>
                <p>{t(`landing.faq.${key}.a`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className={styles.final} aria-labelledby="final-title">
          <h2 id="final-title" className={styles.finalTitle}>
            {t('landing.final.title')}
          </h2>
          <p className={styles.finalBody}>{t('landing.final.body')}</p>
          <ContactButtons />
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.wordmark}>
            <KilimDiamond size={16} />
            Urdho
          </span>
          <span className={styles.footerRights}>{t('landing.footer.rights', { year: new Date().getFullYear() })}</span>
          <Link to="/staff" className={styles.navLink}>
            {t('landing.footer.signIn')}
          </Link>
          <LanguageToggle />
        </div>
        <KilimBand height={14} variant="ink" />
      </footer>
    </div>
  );
}

function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage === 'sq' ? 'sq' : 'en';
  const choose = (code: PageLanguage) => {
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem('urdho-lang', code);
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  };
  return (
    <div className={styles.lang} role="group" aria-label={t('language.label')}>
      {(['sq', 'en'] as const).map((code) => (
        <button key={code} type="button" lang={code} aria-pressed={code === current} aria-label={t(`language.${code}`)} onClick={() => choose(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ContactButtons({ stacked = false }: { stacked?: boolean }) {
  const { t } = useTranslation();
  const links = contactLinks(t('landing.contact.message'), t('landing.contact.subject'));
  const missing = <span className={styles.missing}>{t('landing.contact.placeholder')}</span>;
  return (
    <div className={cx(styles.contact, stacked && styles.contactStacked)}>
      <a
        href={links.whatsapp ?? '#contact'}
        target={links.whatsapp ? '_blank' : undefined}
        rel="noopener"
        className={cx(buttons.button, buttons.primary, buttons.lg, !links.whatsapp && styles.placeholder)}
      >
        <Icon name="chat" size={20} />
        {t('landing.contact.whatsapp')}
        {!links.whatsapp && missing}
      </a>
      <a href={links.email ?? '#contact'} className={cx(buttons.button, buttons.lg, styles.onInk, !links.email && styles.placeholder)}>
        <Icon name="mail" size={20} />
        {t('landing.contact.email')}
        {!links.email && missing}
      </a>
    </div>
  );
}

function Phone({ src, alt, className, eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={cx(styles.phone, className)}>
      <img src={src} alt={alt} width={600} height={1298} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" />
    </div>
  );
}

function Tablet({ src, srcSet, sizes, alt, className }: { src: string; srcSet: string; sizes: string; alt: string; className?: string }) {
  return (
    <div className={cx(styles.tablet, className)}>
      <img src={src} srcSet={srcSet} sizes={sizes} alt={alt} width={1600} height={1112} loading="lazy" decoding="async" />
    </div>
  );
}
