import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderStatus } from '@shared/types';
import { shouldRetry } from '../lib/http';
import { animateChange } from '../lib/motion';
import * as api from './api';

/** The spec's polling interval for the live board. */
const BOARD_POLL_MS = 3000;

export const ME_KEY = ['staff', 'me'];

export function useMeQuery() {
  return useQuery({ queryKey: ME_KEY, queryFn: api.fetchMe, staleTime: Infinity, retry: shouldRetry });
}

const BOARD_KEY = ['staff', 'board'];

export function useBoardQuery(enabled = true) {
  return useQuery({ queryKey: BOARD_KEY, queryFn: api.fetchBoard, refetchInterval: BOARD_POLL_MS, enabled, retry: shouldRetry });
}

type Board = Awaited<ReturnType<typeof api.fetchBoard>>;
type NextStatus = Exclude<OrderStatus, 'new'>;

/**
 * Moves an order on the board the moment it's tapped (the card glides to its next column, a
 * cancelled one leaves), then saves it. If the server refuses, the board goes back to how it was.
 */
export function useOrderStatusMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: NextStatus }) => api.setOrderStatus(id, status),
    onMutate: async ({ id, status }) => {
      // A poll landing mid-change would put the card back for a moment.
      await client.cancelQueries({ queryKey: BOARD_KEY });
      const before = client.getQueryData<Board>(BOARD_KEY);
      if (before) {
        const statusChangedAt = new Date().toISOString();
        const orders =
          status === 'cancelled'
            ? before.orders.filter((o) => o.id !== id)
            : before.orders.map((o) => (o.id === id ? { ...o, status, statusChangedAt } : o));
        animateChange(() => client.setQueryData<Board>(BOARD_KEY, { ...before, orders }));
      }
      return { before };
    },
    onError: (_error, _vars, context) => {
      if (context?.before) animateChange(() => client.setQueryData(BOARD_KEY, context.before));
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['staff'], predicate: (q) => q.queryKey[1] !== 'me' }),
  });
}

export function useTablesQuery() {
  return useQuery({ queryKey: ['staff', 'tables'], queryFn: api.fetchTables, refetchInterval: BOARD_POLL_MS, retry: shouldRetry });
}

export function useVenueQuery() {
  return useQuery({ queryKey: ['staff', 'venue'], queryFn: api.fetchVenue, retry: shouldRetry });
}

export function useMenuAdminQuery() {
  return useQuery({ queryKey: ['staff', 'menu'], queryFn: api.fetchMenuAdmin, retry: shouldRetry });
}

export function useQrTablesQuery(enabled = true) {
  return useQuery({ queryKey: ['staff', 'qr'], queryFn: api.fetchQrTables, enabled, retry: shouldRetry });
}

export function useStaffListQuery() {
  return useQuery({ queryKey: ['staff', 'team'], queryFn: api.fetchStaff, retry: shouldRetry });
}

/**
 * A mutation that refreshes the dashboard's data afterwards, so every view shows what the server
 * now holds. The signed-in account is left alone.
 */
export function useStaffMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: ['staff'], predicate: (q) => q.queryKey[1] !== 'me' }),
  });
}
