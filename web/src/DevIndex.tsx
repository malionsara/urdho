import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { addDemoService, resetDemoData } from './devTools';
import { Button } from './ui/Button';
import { Icon, type IconName } from './ui/Icon';
import { KilimBand } from './ui/Kilim';
import styles from './DevIndex.module.css';

/** Design-review hub: every screen and state one tap away. Replaced by a landing page later. */
const GUEST_LINKS: { key: string; to: string; icon: IconName; swatch?: string }[] = [
  { key: 'menu', to: '/demo/t/demo-4?brand=reset&slow=0', icon: 'qr', swatch: '#C8432A' },
  { key: 'green', to: '/demo/t/demo-4?brand=1F5E45&slow=0', icon: 'qr', swatch: '#1F5E45' },
  { key: 'item', to: '/demo/t/demo-4/item/i-qofte?brand=reset&slow=0', icon: 'pencil' },
  { key: 'empty', to: '/demo/t/demo-6/basket?brand=reset&slow=0', icon: 'bag' },
  { key: 'loading', to: '/demo/t/demo-3?brand=reset&slow=1', icon: 'clock' },
  { key: 'invalid', to: '/demo/t/old-code?brand=reset&slow=0', icon: 'wifiOff' },
];

const STAFF_LINKS: { key: string; to: string; icon: IconName }[] = [
  { key: 'staff', to: '/staff', icon: 'receipt' },
];

export function DevIndex() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function fill() {
    setBusy(true);
    await addDemoService();
    setBusy(false);
    setDone(t('dev.filled'));
  }

  return (
    <main className={styles.page}>
      <KilimBand />
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Urdho</p>
        <h1 className={styles.title}>{t('dev.title')}</h1>
        <p className={styles.lead}>{t('dev.lead')}</p>

        <h2 className={styles.groupTitle}>{t('dev.guestGroup')}</h2>
        <LinkList links={GUEST_LINKS} />

        <h2 className={styles.groupTitle}>{t('dev.staffGroup')}</h2>
        <LinkList links={STAFF_LINKS} />
        <p className={styles.tip}>{t('dev.tip')}</p>

        <div className={styles.tools}>
          <Button onClick={() => void fill()} loading={busy}>
            <Icon name="receipt" size={18} />
            {t('dev.fill')}
          </Button>
          <Button
            variant="outline"
            className={styles.resetButton}
            onClick={() => {
              resetDemoData();
              setDone(t('dev.reset'));
            }}
          >
            <Icon name="refresh" size={18} />
            {t('dev.resetButton')}
          </Button>
          {done && (
            <span className={styles.done} role="status">
              <Icon name="check" size={16} strokeWidth={3} />
              {done}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}

function LinkList({ links }: { links: { key: string; to: string; icon: IconName; swatch?: string }[] }) {
  const { t } = useTranslation();
  return (
    <ul className={styles.list}>
      {links.map((link) => (
        <li key={link.key}>
          <Link to={link.to} className={styles.card}>
            <span className={styles.icon} style={link.swatch ? { background: link.swatch, color: '#fff' } : undefined}>
              <Icon name={link.icon} size={20} />
            </span>
            <span className={styles.text}>
              <strong>{t(`dev.links.${link.key}.title`)}</strong>
              <span>{t(`dev.links.${link.key}.body`)}</span>
            </span>
            <Icon name="chevronRight" size={18} className={styles.chevron} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
