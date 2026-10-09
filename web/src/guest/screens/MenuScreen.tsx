import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useViewTransitionState } from 'react-router';
import { formatLek } from '@shared/money';
import type { MenuItem } from '@shared/types';
import { Icon } from '../../ui/Icon';
import { KilimBand, KilimDiamond } from '../../ui/Kilim';
import { DishImage } from '../../ui/primitives';
import { BottomDock, LanguageSwitcher, PoweredBy, ServiceBanner, TagBadge, VenueLogo } from '../components';
import { useGuest } from '../GuestContext';
import styles from './MenuScreen.module.css';

/** The dishes rise into place the first time the menu opens, not every time a guest comes back to it. */
let menuShown = false;

export function MenuScreen() {
  const { t } = useTranslation();
  const { menu, text, basket, base } = useGuest();
  const { venue, table, categories } = menu;
  const [active, setActive] = useState(categories[0]?.id);
  const [riseIn] = useState(() => !menuShown);
  // The basket bar slides up when the first dish goes in, not each time the menu is shown again.
  const [countOnArrival] = useState(basket.count);
  useEffect(() => {
    menuShown = true;
  }, []);
  const position = new Map(categories.flatMap((c) => c.items).map((item, i) => [item.id, i]));
  const tabsRef = useRef<HTMLDivElement>(null);
  // While a tapped tab scrolls the page, ignore the categories it passes on the way.
  const scrollLock = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Highlight the tab of the category being read.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollLock.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute('data-category');
        if (id) setActive(id);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    document.querySelectorAll('[data-category]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Keep the active tab in view inside the scrolling tab strip.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!strip || !tab) return;
    strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.clientWidth / 2, behavior: 'smooth' });
  }, [active]);

  function jumpTo(categoryId: string) {
    setActive(categoryId);
    clearTimeout(scrollLock.current);
    scrollLock.current = setTimeout(() => (scrollLock.current = undefined), 800);
    document.getElementById(`category-${categoryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <header className={styles.hero}>
        {venue.coverUrl && (
          <img
            className={styles.heroImage}
            src={venue.coverUrl}
            srcSet={venue.coverUrl.endsWith('.webp') ? `${venue.coverUrl.replace(/\.webp$/, '-600.webp')} 600w, ${venue.coverUrl} 1200w` : undefined}
            sizes="(max-width: 480px) 100vw, 480px"
            alt=""
          />
        )}
        <div className={styles.heroTop}>
          <VenueLogo />
          <LanguageSwitcher tone="dark" />
        </div>
        <div className={styles.heroBottom}>
          <h1 className={styles.venueName}>{venue.name}</h1>
          <div className={styles.heroChips}>
            <span className={styles.tableChip}>{t('common.table', { number: table.number })}</span>
            <span className={styles.payChip}>
              <Icon name="cash" size={16} strokeWidth={2.2} />
              {t('menu.payAtEnd')}
            </span>
          </div>
        </div>
      </header>

      <KilimBand />
      <ServiceBanner />

      <nav className={styles.tabsBar} aria-label={t('menu.categories')}>
        <div className={styles.tabs} ref={tabsRef}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              data-tab={c.id}
              className={styles.tab}
              aria-current={c.id === active ? 'true' : undefined}
              onClick={() => jumpTo(c.id)}
            >
              {text(c.name)}
            </button>
          ))}
        </div>
      </nav>

      <main>
        {categories.map((c) => (
          <section key={c.id} id={`category-${c.id}`} data-category={c.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <KilimDiamond size={18} />
              {text(c.name)}
            </h2>
            <ul className={styles.items}>
              {c.items.map((item) => (
                <li
                  key={item.id}
                  className={riseIn ? styles.rise : undefined}
                  // Stagger the first screenful; everything below it is already in place when scrolled to.
                  style={riseIn ? ({ '--i': Math.min(position.get(item.id) ?? 0, 8) } as CSSProperties) : undefined}
                >
                  <ItemRow item={item} to={`${base}/item/${item.id}`} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <PoweredBy />
      </main>

      {basket.count > 0 && (
        <BottomDock>
          <Link to={`${base}/basket`} viewTransition className={`${styles.basketBar} ${countOnArrival === 0 ? styles.basketBarIn : ''}`}>
            {/* Keyed, so every dish added bumps the count and rolls the total. */}
            <span key={basket.count} className={`${styles.basketCount} ${basket.count !== countOnArrival ? styles.bump : ''}`}>
              {basket.count}
            </span>
            <span className={styles.basketLabel}>{t('menu.viewBasket')}</span>
            <span key={basket.totalLek} className={`${styles.basketTotal} ${basket.count !== countOnArrival ? styles.roll : ''}`}>
              {formatLek(basket.totalLek)}
            </span>
          </Link>
        </BottomDock>
      )}
    </>
  );
}

function ItemRow({ item, to }: { item: MenuItem; to: string }) {
  const { t } = useTranslation();
  const { text, basket, toast } = useGuest();
  const navigate = useNavigate();
  // While this dish's page opens (or closes), its photo is the one that grows into the page.
  const opening = useViewTransitionState(to);
  const name = text(item.name);
  const inBasket = basket.quantityOf(item.id);
  const soldOut = !item.available;
  const tags = item.tags.filter((tag) => tag !== 'new');

  // Dishes with choices open the item page; simple ones go straight into the basket.
  function quickAdd() {
    if (item.optionGroups.length > 0) {
      navigate(to, { viewTransition: true });
      return;
    }
    basket.add(item.id, [], 1);
    toast.show(t('item.added'));
  }

  const body = (
    <>
      <div className={styles.itemText}>
        <h3 className={styles.itemName}>{name}</h3>
        <p className={styles.itemDescription}>{text(item.description)}</p>
        {tags.length > 0 && (
          <div className={styles.itemBadges}>
            {tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}
        <p className={styles.itemPrice}>{formatLek(item.priceLek)}</p>
      </div>
      <div className={styles.itemImage}>
        <DishImage photoUrl={item.photoUrl} name={name} muted={soldOut} transitionName={opening ? 'dish-photo' : undefined} />
        {item.tags.includes('new') && !soldOut && <span className={styles.newFlag}>{t('tags.new')}</span>}
        {soldOut && <span className={styles.soldOutFlag}>{t('menu.soldOut')}</span>}
      </div>
    </>
  );

  if (soldOut) {
    return (
      <div className={`${styles.item} ${styles.itemSoldOut}`} aria-disabled="true">
        {body}
      </div>
    );
  }

  return (
    <div className={styles.itemWrap}>
      <Link to={to} viewTransition className={styles.item}>
        {body}
      </Link>
      <button
        type="button"
        className={`${styles.quickAdd} ${inBasket > 0 ? styles.quickAddActive : ''}`}
        onClick={quickAdd}
        aria-label={inBasket > 0 ? `${t('menu.inBasket', { count: inBasket })}. ${t('basket.addAddon', { name })}` : t('basket.addAddon', { name })}
      >
        {inBasket > 0 ? (
          <span key={inBasket} className={`${styles.quickAddCount} ${styles.bump}`}>
            {inBasket}
          </span>
        ) : (
          <Icon name="plus" size={22} strokeWidth={2.8} />
        )}
      </button>
    </div>
  );
}
