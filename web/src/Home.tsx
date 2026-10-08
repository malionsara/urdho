import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Icon } from './ui/Icon';
import { KilimBand } from './ui/Kilim';
import styles from './DevIndex.module.css';

/** The site's front door in production. Guests arrive through a table's QR code, not here. */
export function Home() {
  const { t } = useTranslation();
  return (
    <main className={styles.page}>
      <KilimBand />
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Urdho</p>
        <h1 className={styles.title}>{t('home.title')}</h1>
        <p className={styles.lead}>{t('home.lead')}</p>
        <ul className={styles.list}>
          <li>
            <Link className={styles.card} to="/staff">
              <span className={styles.icon}>
                <Icon name="receipt" size={22} />
              </span>
              <span className={styles.text}>
                <strong>{t('home.staff')}</strong>
                <span>{t('home.staffBody')}</span>
              </span>
              <Icon name="chevronRight" size={20} className={styles.chevron} />
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
