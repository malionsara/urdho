import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

/** The spec's polling interval for the live board. */
const BOARD_POLL_MS = 3000;

export function useBoardQuery(enabled = true) {
  return useQuery({ queryKey: ['staff', 'board'], queryFn: api.fetchBoard, refetchInterval: BOARD_POLL_MS, enabled });
}

export function useTablesQuery() {
  return useQuery({ queryKey: ['staff', 'tables'], queryFn: api.fetchTables, refetchInterval: BOARD_POLL_MS });
}

export function useVenueQuery() {
  return useQuery({ queryKey: ['staff', 'venue'], queryFn: api.fetchVenue });
}

export function useMenuAdminQuery() {
  return useQuery({ queryKey: ['staff', 'menu'], queryFn: api.fetchMenuAdmin });
}

export function useQrTablesQuery() {
  return useQuery({ queryKey: ['staff', 'qr'], queryFn: api.fetchQrTables });
}

export function useStaffListQuery() {
  return useQuery({ queryKey: ['staff', 'team'], queryFn: api.fetchStaff });
}

/** A mutation that refreshes every staff view afterwards: the mock is cheap, the views stay honest. */
export function useStaffMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: ['staff'] }),
  });
}
