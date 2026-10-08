import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { SEED_STAFF } from '@shared/demo';
import { brandStyle } from '../../lib/brand';
import { isApiError } from '../../lib/http';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { KilimBand } from '../../ui/Kilim';
import { Notice, TextField } from '../../ui/primitives';
import { login } from '../api';
import { useStaff } from '../session';
import { StaffSplash } from '../StaffApp';
import styles from './LoginScreen.module.css';

/** One-tap demo accounts exist only on the dev server, where the demo password is known. */
const DEMO_PASSWORD = __DEMO_STAFF_PASSWORD__;

export function LoginScreen() {
  const { t } = useTranslation();
  const { user, loading, signIn } = useStaff();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <StaffSplash />;
  if (user) return <Navigate to={user.mustChangePassword ? '/staff/password' : '/staff/orders'} replace />;

  async function attempt(address: string, secret: string) {
    setBusy(true);
    setError(null);
    try {
      const me = await login(address, secret);
      signIn(me);
      navigate(me.user.mustChangePassword ? '/staff/password' : '/staff/orders', { replace: true });
    } catch (e) {
      setError(isApiError(e, 'invalid_login') ? t('staff.login.error') : t(`errors.api.${(e as Error).message}`, { defaultValue: t('errors.generic') }));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void attempt(email, password);
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
        <form className={styles.form} onSubmit={submit}>
          <p className={styles.eyebrow}>{t('staff.login.eyebrow')}</p>
          <h1 className={styles.title}>{t('staff.login.title')}</h1>
          <TextField label={t('staff.login.email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField
            label={t('staff.login.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Notice icon="lock">{error}</Notice>}
          <Button type="submit" size="lg" block loading={busy}>
            {busy ? t('staff.login.submitting') : t('staff.login.submit')}
          </Button>
        </form>

        {DEMO_PASSWORD && (
          <section className={styles.demo} aria-labelledby="demo-title">
            <h2 id="demo-title" className={styles.demoTitle}>
              {t('staff.login.demoTitle')}
            </h2>
            <p className={styles.demoBody}>{t('staff.login.demoBody')}</p>
            <div className={styles.demoAccounts}>
              {SEED_STAFF.map((account) => (
                <button key={account.id} type="button" className={styles.demoAccount} disabled={busy} onClick={() => void attempt(account.email, DEMO_PASSWORD)}>
                  <span className={styles.demoRole}>{t(`staff.roles.${account.role}`)}</span>
                  <span className={styles.demoName}>{account.name}</span>
                  <Icon name="chevronRight" size={18} />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
