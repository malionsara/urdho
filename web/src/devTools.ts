import { DEMO_SLUG } from '@shared/demo';
import { callWaiter, fetchMenu, placeOrder } from './guest/api';

/*
 * Design-review helper: fills the demo venue's board through the real guest API, exactly as
 * guests' phones would. To start over, run `pnpm db:reset`.
 */

export async function addDemoService(): Promise<void> {
  const menu = await fetchMenu(DEMO_SLUG, 'demo-1');
  const dishes = new Map(menu.categories.flatMap((c) => c.items).map((i) => [i.name.sq ?? '', i]));
  const pick = (name: string, optionNames: string[] = []) => {
    const item = dishes.get(name);
    if (!item) return [];
    const optionIds = item.optionGroups.flatMap((g) => g.options).filter((o) => optionNames.includes(o.name.sq ?? '')).map((o) => o.id);
    return [{ itemId: item.id, optionIds }];
  };
  const order = async (table: number, guestName: string, note: string, lines: { itemId: string; optionIds: string[]; qty: number }[]) => {
    await fetchMenu(DEMO_SLUG, `demo-${table}`);
    await placeOrder(DEMO_SLUG, `demo-${table}`, { clientRef: crypto.randomUUID(), guestName, note, lines });
  };

  await order(2, 'Arben', '', [
    ...pick('Tavë kosi').map((l) => ({ ...l, qty: 2 })),
    ...pick('Sallatë fshati', ['Pa qepë']).map((l) => ({ ...l, qty: 1 })),
    ...pick('Birrë Tirana', ['50 cl']).map((l) => ({ ...l, qty: 2 })),
  ]);
  await order(5, '', 'Alergji nga arrat, ju lutem kujdes', [
    ...pick('Qofte të fshira', ['10 copë', 'Patate të skuqura']).map((l) => ({ ...l, qty: 1 })),
    ...pick('Dhallë').map((l) => ({ ...l, qty: 2 })),
  ]);
  await order(1, 'Elira', '', [...pick('Byrek me spinaq').map((l) => ({ ...l, qty: 2 })), ...pick('Fërgesë Tirane').map((l) => ({ ...l, qty: 1 }))]);
  await fetchMenu(DEMO_SLUG, 'demo-6');
  await callWaiter(DEMO_SLUG, 'demo-6');
}
