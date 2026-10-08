import { useMutation, useQuery } from '@tanstack/react-query';
import type { OrderInput } from '@shared/types';
import { callWaiter, fetchMenu, fetchOrder, placeOrder } from './api';

/** How often the order status page checks for changes made on the staff board (spec: 5 s). */
const ORDER_POLL_MS = 5000;

export function useMenuQuery(slug: string, qrToken: string) {
  return useQuery({
    queryKey: ['guest', 'menu', slug, qrToken],
    queryFn: () => fetchMenu(slug, qrToken),
    // Short, so sold-out switches on the dashboard reach guests quickly.
    staleTime: 30_000,
    retry: (count, error) => error.message !== 'table_invalid' && count < 2,
  });
}

export function useOrderQuery(slug: string, qrToken: string, orderId: string) {
  return useQuery({
    queryKey: ['guest', 'order', slug, qrToken, orderId],
    queryFn: () => fetchOrder(slug, qrToken, orderId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'served' || status === 'cancelled' ? false : ORDER_POLL_MS;
    },
  });
}

export function usePlaceOrder(slug: string, qrToken: string) {
  return useMutation({
    mutationFn: (input: OrderInput) => placeOrder(slug, qrToken, input),
    // A dropped connection retries with the same clientRef, so the kitchen never gets it twice.
    retry: 2,
  });
}

export function useCallWaiter(slug: string, qrToken: string) {
  return useMutation({ mutationFn: () => callWaiter(slug, qrToken) });
}
