import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router';
import { AppError } from './AppError';
import { GuestLayout } from './guest/GuestLayout';
import { Home } from './Home';
import { useNavMotion } from './lib/motion';
import { BasketScreen } from './guest/screens/BasketScreen';
import { CheckoutScreen } from './guest/screens/CheckoutScreen';
import { ItemScreen } from './guest/screens/ItemScreen';
import { MenuScreen } from './guest/screens/MenuScreen';
import { OrderStatusScreen } from './guest/screens/OrderStatusScreen';
import { NotFound } from './NotFound';

function Root() {
  useNavMotion();
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <AppError />,
    children: [
      // The design-review hub (with its "fill the board" tool) exists only on the dev server; the
      // production build doesn't even contain it.
      import.meta.env.DEV
        ? { path: '/', lazy: async () => ({ Component: (await import('./DevIndex')).DevIndex }), HydrateFallback: () => null }
        : { path: '/', element: <Home /> },
      {
        path: '/:slug/t/:qrToken',
        element: <GuestLayout />,
        children: [
          { index: true, element: <MenuScreen /> },
          { path: 'item/:itemId', element: <ItemScreen /> },
          { path: 'basket', element: <BasketScreen /> },
          { path: 'checkout', element: <CheckoutScreen /> },
          { path: 'order/:orderId', element: <OrderStatusScreen /> },
        ],
      },
      {
        // Loaded separately so guests never download dashboard code.
        path: '/staff/*',
        lazy: async () => ({ Component: (await import('./staff/StaffApp')).StaffApp }),
        // While the dashboard downloads on a first visit: its dark background, not a white flash.
        HydrateFallback: () => <div aria-busy="true" style={{ minHeight: '100dvh', background: 'var(--ink)' }} />,
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
