import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ItemTag, Language } from '@shared/types';
import { brandStyle } from '../lib/brand';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { KilimBand } from '../ui/Kilim';
import { Badge, Skeleton } from '../ui/primitives';
import { useGuest } from './GuestContext';
import styles from './guest.module.css';

const DEFAULT_BRAND = '#C8432A';

/** Centres the guest app in a phone-width column and applies the venue's brand colour. */
export function GuestShell({ brand, children }: { brand: string | null; children: ReactNode }) {
  return (
    <div data-brand className={styles.shell} style={brandStyle(brand ?? DEFAULT_BRAND)}>
      <div className={styles.column}>{children}</div>
    </div>
  );
}

export function TopBar({ title, backTo, right }: { title: string; backTo: string; right?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header className={styles.topBar}>
      <Link to={backTo} className={styles.backButton} aria-label={t('common.back')}>
        <Icon name="back" size={22} strokeWidth={2.4} />
      </Link>
      <h1 className={styles.topBarTitle}>{title}</h1>
      <div className={styles.topBarRight}>{right}</div>
    </header>
  );
}

export function TableChip() {
  const { t } = useTranslation();
  const { menu } = useGuest();
  return <span className={styles.tableChip}>{t('common.table', { number: menu.table.number })}</span>;
}

export function VenueLogo({ size = 52 }: { size?: number }) {
  const { menu } = useGuest();
  const { name, logoUrl } = menu.venue;
  const initials = name
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('sq');
  return logoUrl ? (
    <img src={logoUrl} alt="" className={styles.logo} style={{ width: size, height: size }} />
  ) : (
    <span className={styles.logo} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials}
    </span>
  );
}

export function LanguageSwitcher({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { t } = useTranslation();
  const { menu, lang, setLang } = useGuest();
  const languages = menu.venue.languages;
  if (languages.length < 2) return null;
  return (
    <div className={`${styles.langSwitch} ${tone === 'dark' ? styles.langSwitchDark : ''}`} role="group" aria-label={t('language.label')}>
      {languages.map((code: Language) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === lang}
          aria-label={t(`language.${code}`)}
          className={styles.langOption}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const TAG_ICONS: Record<ItemTag, IconName> = { vegetarian: 'leaf', spicy: 'chili', new: 'sparkle' };
const TAG_TONES = { vegetarian: 'success', spicy: 'danger', new: 'brand' } as const;

export function TagBadge({ tag }: { tag: ItemTag }) {
  const { t } = useTranslation();
  return (
    <Badge tone={TAG_TONES[tag]} icon={TAG_ICONS[tag]}>
      {t(`tags.${tag}`)}
    </Badge>
  );
}

/** Tells guests when they can look but not order: the kitchen is closed, or the phone is offline. */
export function ServiceBanner() {
  const { t } = useTranslation();
  const { menu } = useGuest();
  const kind = menu.offline ? 'offline' : !menu.orderingOpen ? 'closed' : null;
  if (!kind) return null;
  return (
    <div className={styles.banner} role="status">
      <Icon name={kind === 'offline' ? 'wifiOff' : 'clock'} size={20} strokeWidth={2.2} />
      <p>
        <strong>{t(`menu.${kind}Title`)}</strong> {t(`menu.${kind}Body`)}
      </p>
    </div>
  );
}

export function PoweredBy() {
  const { t } = useTranslation();
  return (
    <footer className={styles.footer}>
      <KilimBand height={16} variant="ink" />
      <p className={styles.poweredBy}>{t('common.poweredBy')}</p>
    </footer>
  );
}

export function Toast() {
  const { toast } = useGuest();
  return (
    <div className={styles.toastRegion} aria-live="polite">
      {toast.message && (
        <div key={toast.id} className={styles.toast}>
          <span className={styles.toastIcon}>
            <Icon name="check" size={14} strokeWidth={3.2} />
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
}

/** Pins its children to the bottom of the column, above the phone's home indicator. */
export function BottomDock({ children }: { children: ReactNode }) {
  return (
    <>
      <div className={styles.dockSpacer} aria-hidden />
      <div className={styles.dock}>{children}</div>
    </>
  );
}

export function StateMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.stateMessage}>
      <div className={styles.stateIcon}>
        <Icon name={icon} size={36} strokeWidth={1.8} />
      </div>
      <h1 className={styles.stateTitle}>{title}</h1>
      {body && <p className={styles.stateBody}>{body}</p>}
      {action}
    </div>
  );
}

export function GuestLoadError({ code, onRetry }: { code: string; onRetry: () => void }) {
  const { t } = useTranslation();
  if (code === 'table_invalid') {
    return <StateMessage icon="qr" title={t('errors.tableTitle')} body={t('errors.tableBody')} />;
  }
  return (
    <StateMessage
      icon="wifiOff"
      title={t('errors.generic')}
      action={
        <Button variant="outline" onClick={onRetry}>
          {t('errors.retry')}
        </Button>
      }
    />
  );
}

export function MenuSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true">
      <span className="visually-hidden">{t('common.loading')}</span>
      <div className={styles.skeletonHero}>
        <Skeleton dark width="62%" height={40} radius={10} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton dark width={96} height={32} radius={999} />
          <Skeleton dark width={150} height={32} radius={999} />
        </div>
      </div>
      <div className={styles.skeletonTabs}>
        <Skeleton dark width={84} height={38} radius={999} />
        <Skeleton dark width={150} height={38} radius={999} />
        <Skeleton dark width={130} height={38} radius={999} />
      </div>
      <div className={styles.skeletonList}>
        <Skeleton width="40%" height={34} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <div style={{ display: 'grid', gap: 8, flex: 1, alignContent: 'start' }}>
              <Skeleton width="60%" height={20} />
              <Skeleton width="95%" height={14} />
              <Skeleton width="80%" height={14} />
              <Skeleton width={70} height={20} />
            </div>
            <Skeleton width={116} height={116} radius={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
