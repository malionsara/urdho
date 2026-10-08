import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shouldRetry } from '../lib/http';
import * as api from './api';

/** The spec's polling interval for the live board. */
const BOARD_POLL_MS = 3000;

export const ME_KEY = ['staff', 'me'];

export function useMeQuery() {
  return useQuery({ queryKey: ME_KEY, queryFn: api.fetchMe, staleTime: Infinity, retry: shouldRetry });
}

export function useBoardQuery(enabled = true) {
  return useQuery({ queryKey: ['staff', 'board'], queryFn: api.fetchBoard, refetchInterval: BOARD_POLL_MS, enabled, retry: shouldRetry });
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
