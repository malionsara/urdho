import { useMutation, useQuery } from '@tanstack/react-query';
import type { OrderInput } from '@shared/types';
import { ApiError, shouldRetry } from '../lib/http';
import { callWaiter, fetchMenu, fetchOrder, placeOrder } from './api';

/** How often the order status page checks for changes made on the staff board (spec: 5 s). */
const ORDER_POLL_MS = 5000;

export const menuQueryKey = (slug: string, qrToken: string) => ['guest', 'menu', slug, qrToken];

export function useMenuQuery(slug: string, qrToken: string) {
  return useQuery({
    queryKey: menuQueryKey(slug, qrToken),
    queryFn: () => fetchMenu(slug, qrToken),
    // Short, so sold-out switches on the dashboard reach guests quickly; a guest reading the menu
    // for a while gets them once a minute (paused while the phone is locked or the tab hidden).
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: shouldRetry,
  });
}

export function useOrderQuery(slug: string, qrToken: string, orderId: string) {
  return useQuery({
    queryKey: ['guest', 'order', slug, qrToken, orderId],
    queryFn: () => fetchOrder(slug, qrToken, orderId),
    retry: shouldRetry,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const status = query.state.data?.status;
      return status === 'served' || status === 'cancelled' ? false : ORDER_POLL_MS;
    },
  });
}

export function usePlaceOrder(slug: string, qrToken: string) {
  return useMutation({
    mutationFn: (input: OrderInput) => placeOrder(slug, qrToken, input),
    // A lost connection retries with the same clientRef, so the kitchen never gets it twice.
    retry: (count, error) => error instanceof ApiError && error.code === 'network' && count < 3,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
  });
}

export function useCallWaiter(slug: string, qrToken: string) {
  return useMutation({ mutationFn: () => callWaiter(slug, qrToken) });
}
