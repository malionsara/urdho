import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { brandStyle } from '../lib/brand';
import { Rail, StaffToastProvider } from './components';
import { useBoardQuery, useVenueQuery } from './queries';
import { BoardScreen } from './screens/BoardScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MenuManagerScreen } from './screens/MenuManagerScreen';
import { QrCodesScreen } from './screens/QrCodesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TablesScreen } from './screens/TablesScreen';
import { TeamScreen } from './screens/TeamScreen';
import { StaffSessionProvider, useStaff } from './session';
import styles from './staff.module.css';

/** The staff dashboard, loaded only when someone opens /staff. */
export function StaffApp() {
  return (
    <StaffSessionProvider>
      <StaffToastProvider>
        <Routes>
          <Route path="login" element={<LoginScreen />} />
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

/** The frame around every signed-in page: rail, brand colour, and the new-order chime. */
function SignedIn() {
  const { user, service } = useStaff();
  const venue = useVenueQuery();
  const board = useBoardQuery(user !== null);
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

  if (!user) return <Navigate to="/staff/login" replace />;

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
