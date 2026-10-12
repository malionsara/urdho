import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { brandStyle } from '../lib/brand';
import { Rail, StaffToastProvider } from './components';
import { PACE_MS, useClock } from './pace';
import { boardPace, useBoardQuery, useSetupQuery, useVenueQuery } from './queries';
import { BoardScreen } from './screens/BoardScreen';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MenuManagerScreen } from './screens/MenuManagerScreen';
import { QrCodesScreen } from './screens/QrCodesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';
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
            <Route index element={<Home />} />
            <Route path="start" element={<RoleGate page="start"><SetupScreen /></RoleGate>} />
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

/** Where /staff opens: the get-started list for an owner who hasn't finished it, the orders otherwise. */
function Home() {
  const { user } = useStaff();
  const owner = user?.role === 'owner';
  const setup = useSetupQuery(owner);
  if (owner && setup.isPending) return <StaffSplash />;
  const unfinished = owner && setup.data && !setup.data.dismissed && setup.data.steps.some((s) => !s.done);
  return <Navigate to={unfinished ? 'start' : 'orders'} replace />;
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
  const setup = useSetupQuery(signedIn && user?.role === 'owner');
  const stepsLeft = setup.data && !setup.data.dismissed ? setup.data.steps.filter((s) => !s.done).length : 0;
  const seen = useRef<Set<string> | null>(null);

  // Closed and every table settled: the screen may sleep, and the board checks in every half hour.
  // Each of those checks re-reads the venue too, so hours changed on another device are seen.
  const now = useClock();
  const resting = boardPace(board.data, venue.data, now) === PACE_MS.closed;
  const { keepAwake } = service;
  const { refetch: refetchVenue } = venue;
  useEffect(() => keepAwake(!resting), [keepAwake, resting]);
  useEffect(() => {
    if (resting && board.dataUpdatedAt) void refetchVenue();
  }, [resting, board.dataUpdatedAt, refetchVenue]);

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
      <Rail venue={venue.data} badges={{ orders: newCount + callCount, start: stepsLeft }} hidden={stepsLeft > 0 ? [] : ['start']} />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}
