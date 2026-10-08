import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { brandStyle } from '../lib/brand';
import { Rail, StaffToastProvider } from './components';
import { useBoardQuery, useVenueQuery } from './queries';
import { BoardScreen } from './screens/BoardScreen';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MenuManagerScreen } from './screens/MenuManagerScreen';
import { QrCodesScreen } from './screens/QrCodesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TablesScreen } from './screens/TablesScreen';
import { TeamScreen } from './screens/TeamScreen';
import { StaffSessionProvider, useStaff } from './session';
import styles from './staff.module.css';

/**
 * Makes /staff installable (home screen on a tablet or phone). Only the dashboard links the
 * manifest, so guests ordering at a table are never offered to install the staff app.
 */
function useInstallableDashboard() {
  useEffect(() => {
    const added = [
      Object.assign(document.createElement('link'), { rel: 'manifest', href: '/staff.webmanifest' }),
      Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-capable', content: 'yes' }),
      Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-title', content: 'Urdho' }),
    ];
    document.head.append(...added);
    return () => added.forEach((el) => el.remove());
  }, []);
}

/** The staff dashboard, loaded only when someone opens /staff. */
export function StaffApp() {
  useInstallableDashboard();
  return (
    <StaffSessionProvider>
      <StaffToastProvider>
        <Routes>
          <Route path="login" element={<LoginScreen />} />
          <Route path="password" element={<ChangePasswordScreen />} />
          <Route element={<SignedIn />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<BoardScreen />} />
            <Route path="tables" element={<TablesScreen />} />
            <Route path="menu" element={<RoleGate page="menu"><MenuManagerScreen /></RoleGate>} />
            <Route path="qr" element={<RoleGate page="qr"><QrCodesScreen /></RoleGate>} />
            <Route path="team" element={<RoleGate page="team"><TeamScreen /></RoleGate>} />
            <Route path="settings" element={<RoleGate page="settings"><SettingsScreen /></RoleGate>} />
            <Route path="*" element={<Navigate to="orders" replace />} />
          </Route>
        </Routes>
      </StaffToastProvider>
    </StaffSessionProvider>
  );
}

function RoleGate({ page, children }: { page: string; children: ReactNode }) {
  const { can } = useStaff();
  return can(page) ? children : <Navigate to="/staff/orders" replace />;
}

/** While we ask the server who this device belongs to. */
export function StaffSplash() {
  const { t } = useTranslation();
  return (
    <div className={styles.splash} aria-busy="true">
      <span className="visually-hidden">{t('common.loading')}</span>
      <span className={styles.splashDot} />
    </div>
  );
}

/** The frame around every signed-in page: rail, brand colour, and the new-order chime. */
function SignedIn() {
  const { user, loading, service } = useStaff();
  const signedIn = user !== null && !user.mustChangePassword;
  const venue = useVenueQuery();
  const board = useBoardQuery(signedIn);
  const seen = useRef<Set<string> | null>(null);

  // Ring for anything that appeared since the last poll, whichever page is open.
  useEffect(() => {
    const data = board.data;
    if (!data) return;
    const previous = seen.current;
    if (previous) {
      if (data.orders.some((o) => o.status === 'new' && !previous.has(o.id))) service.chime('order');
      else if (data.calls.some((c) => !previous.has(c.id))) service.chime('call');
    }
    seen.current = new Set([...(previous ?? []), ...data.orders.map((o) => o.id), ...data.calls.map((c) => c.id)]);
  }, [board.data, service]);

  if (loading) return <StaffSplash />;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/staff/password" replace />;

  const newCount = board.data?.orders.filter((o) => o.status === 'new').length ?? 0;
  const callCount = board.data?.calls.length ?? 0;

  return (
    <div data-brand className={styles.app} style={brandStyle(venue.data?.brandColor ?? '#C8432A')}>
      <Rail venue={venue.data} badges={{ orders: newCount + callCount }} />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}
