import type { MenuItemInput, VenueSettingsInput } from '@shared/schemas';
import type { LocalizedText, MenuItem, OrderStatus, PaymentMethod, PlacedOrderLine, StaffRole, StaffUser, Venue } from '@shared/types';
import { api, ApiError } from '../lib/http';

/*
 * The staff dashboard's API. The session is an httpOnly cookie the browser sends by itself; the
 * venue always comes from it on the server, so no call here names a venue.
 */

export interface StaffMe {
  user: StaffUser & { mustChangePassword: boolean };
  venue: Venue;
}

export interface ServiceOrder {
  id: string;
  sessionId: string;
  tableId: string;
  tableNumber: number;
  status: OrderStatus;
  guestName: string;
  note: string;
  createdAt: string;
  statusChangedAt: string;
  lines: PlacedOrderLine[];
  totalLek: number;
}

export interface BoardOrder extends ServiceOrder {
  /** The first order of its table session: staff check someone is really seated. */
  firstInSession: boolean;
}

export interface BoardCall {
  id: string;
  sessionId: string;
  tableId: string;
  tableNumber: number;
  createdAt: string;
}

export interface TableSummary {
  table: { id: string; number: number; label: string | null };
  session: { id: string; openedAt: string } | null;
  orders: ServiceOrder[];
  billLek: number;
  openCall: boolean;
}

export interface MenuCategoryRow {
  id: string;
  name: LocalizedText;
  active: boolean;
}

export interface QrTable {
  id: string;
  number: number;
  label: string | null;
  qrToken: string;
}

export type PhotoKind = 'dish' | 'cover' | 'logo';

/* Sign-in ---------------------------------------------------------------------- */

export const login = (email: string, password: string) => api<StaffMe>('/staff/login', { method: 'POST', body: { email, password } });

export const logout = () => api<void>('/staff/logout', { method: 'POST' });

/** Who is signed in on this device, or null. */
export async function fetchMe(): Promise<StaffMe | null> {
  try {
    return await api<StaffMe>('/staff/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  api<void>('/staff/password', { method: 'POST', body: { currentPassword, newPassword } });

/* Service ---------------------------------------------------------------------- */

export const fetchBoard = () => api<{ orders: BoardOrder[]; calls: BoardCall[] }>('/staff/board');

export const setOrderStatus = (orderId: string, status: Exclude<OrderStatus, 'new'>) =>
  api<void>(`/staff/orders/${orderId}`, { method: 'PATCH', body: { status } });

export const acknowledgeCall = (callId: string) => api<void>(`/staff/calls/${callId}/acknowledge`, { method: 'POST' });

export const fetchTables = async () => (await api<{ tables: TableSummary[] }>('/staff/tables')).tables;

export const markSessionPaid = (sessionId: string, method: PaymentMethod) =>
  api<{ paymentId: string; amountLek: number }>(`/staff/sessions/${sessionId}/pay`, { method: 'POST', body: { method } });

export const closeEmptySession = (sessionId: string) => api<void>(`/staff/sessions/${sessionId}/close`, { method: 'POST' });

/* Menu ------------------------------------------------------------------------- */

export const fetchMenuAdmin = () => api<{ categories: MenuCategoryRow[]; items: MenuItem[] }>('/staff/menu');

export const createItem = async (input: MenuItemInput) => (await api<{ item: MenuItem }>('/staff/menu/items', { method: 'POST', body: input })).item;

export const updateItem = async (id: string, input: MenuItemInput) =>
  (await api<{ item: MenuItem }>(`/staff/menu/items/${id}`, { method: 'PUT', body: input })).item;

export const setItemAvailable = (id: string, available: boolean) =>
  api<void>(`/staff/menu/items/${id}/availability`, { method: 'PATCH', body: { available } });

export const archiveItem = (id: string) => api<void>(`/staff/menu/items/${id}`, { method: 'DELETE' });

export const addCategory = async (name: LocalizedText) =>
  (await api<{ category: MenuCategoryRow }>('/staff/menu/categories', { method: 'POST', body: { name } })).category;

/** Uploads a photo the browser has already shrunk; returns the URL to store. */
export async function uploadPhoto(kind: PhotoKind, photo: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', photo, `photo.${photo.type.split('/')[1] ?? 'webp'}`);
  return (await api<{ url: string }>(`/staff/uploads?kind=${kind}`, { method: 'POST', form })).url;
}

/* Tables and QR codes ------------------------------------------------------------- */

export const fetchQrTables = () => api<{ venue: Venue; tables: QrTable[] }>('/staff/qr');

export const addTable = () => api<{ table: QrTable }>('/staff/tables', { method: 'POST' });

export const resetQrToken = (tableId: string) => api<{ table: QrTable }>(`/staff/tables/${tableId}/reset-qr`, { method: 'POST' });

/* Staff accounts ------------------------------------------------------------------ */

export const fetchStaff = async () => (await api<{ staff: StaffUser[] }>('/staff/team')).staff;

export const addStaff = (input: { name: string; email: string; role: StaffRole }) =>
  api<{ user: StaffUser; temporaryPassword: string }>('/staff/team', { method: 'POST', body: input });

export const removeStaff = (userId: string) => api<void>(`/staff/team/${userId}`, { method: 'DELETE' });

/* Venue settings ------------------------------------------------------------------ */

export const fetchVenue = async () => (await api<{ venue: Venue }>('/staff/venue')).venue;

export const saveVenue = async (settings: VenueSettingsInput) => (await api<{ venue: Venue }>('/staff/venue', { method: 'PUT', body: settings })).venue;
