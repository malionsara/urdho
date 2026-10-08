import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { brandStyle } from '../../lib/brand';
import { isApiError } from '../../lib/http';
import { Button } from '../../ui/Button';
import { KilimBand } from '../../ui/Kilim';
import { Notice, TextField } from '../../ui/primitives';
import { changePassword } from '../api';
import { useStaff } from '../session';
import { StaffSplash } from '../StaffApp';
import styles from './LoginScreen.module.css';

const MIN_LENGTH = 10;

/** First sign-in with a temporary password, or a change by choice: pick your own. */
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { user, loading, passwordChanged, signOut } = useStaff();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <StaffSplash />;
  if (!user) return <Navigate to="/staff/login" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < MIN_LENGTH) return setError(t('staff.password.tooShort', { count: MIN_LENGTH }));
    if (next !== repeat) return setError(t('staff.password.mismatch'));
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      passwordChanged();
      navigate('/staff/orders', { replace: true });
    } catch (err) {
      setError(
        isApiError(err, 'wrong_password')
          ? t('staff.password.wrongCurrent')
          : isApiError(err, 'same_password')
            ? t('staff.password.same')
            : t(`errors.api.${(err as Error).message}`, { defaultValue: t('errors.generic') }),
      );
      setBusy(false);
    }
  }

  return (
    <div data-brand className={styles.page} style={brandStyle('#C8432A')}>
      <aside className={styles.visual} aria-hidden>
        <img src="/demo/cover-600.webp" srcSet="/demo/cover-600.webp 600w, /demo/cover.webp 1200w" sizes="50vw" alt="" />
        <div className={styles.visualText}>
          <p className={styles.wordmark}>Urdho</p>
          <p className={styles.tagline}>{t('staff.login.tagline')}</p>
        </div>
        <KilimBand className={styles.visualKilim} />
      </aside>

      <main className={styles.formSide}>
        <form className={styles.form} onSubmit={(e) => void submit(e)}>
          <p className={styles.eyebrow}>{user.name}</p>
          <h1 className={styles.title}>{t('staff.password.title')}</h1>
          <p className={styles.demoBody}>{user.mustChangePassword ? t('staff.password.firstTime') : t('staff.password.body')}</p>
          <TextField
            label={user.mustChangePassword ? t('staff.password.temporary') : t('staff.password.current')}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <TextField
            label={t('staff.password.new')}
            hint={t('staff.password.hint', { count: MIN_LENGTH })}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <TextField label={t('staff.password.repeat')} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          {error && <Notice icon="lock">{error}</Notice>}
          <Button type="submit" size="lg" block loading={busy}>
            {t('staff.password.submit')}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('staff.nav.logout')}
          </Button>
        </form>
      </main>
    </div>
  );
}
