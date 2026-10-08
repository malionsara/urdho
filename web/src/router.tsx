import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router';
import { DevIndex } from './DevIndex';
import { GuestLayout } from './guest/GuestLayout';
import { BasketScreen } from './guest/screens/BasketScreen';
import { CheckoutScreen } from './guest/screens/CheckoutScreen';
import { ItemScreen } from './guest/screens/ItemScreen';
import { MenuScreen } from './guest/screens/MenuScreen';
import { OrderStatusScreen } from './guest/screens/OrderStatusScreen';
import { NotFound } from './NotFound';

function Root() {
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
    children: [
      { path: '/', element: <DevIndex /> },
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
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
