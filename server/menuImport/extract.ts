import { callTool, type ContentBlock } from './claude';
import { DRAFT_SCHEMA, type MenuDraft } from './draft';
import type { MenuSource } from './sources';

/* How Claude is asked to read a menu. The rules that keep guests safe are spelled out: never guess allergens or invent ingredients. */

const SYSTEM = `You turn restaurant menus into structured data for Urdho, a table-ordering app used by restaurants, cafés and bars in Albania. You read photos, PDFs, web pages and spreadsheets of one venue's menu and call save_menu exactly once with the whole menu. Accuracy matters more than completeness: prices and allergens you get wrong reach real guests.`;

const INSTRUCTIONS = `Read the menu in the sources above and call save_menu with all of it.

Categories and order
- Keep the menu's own categories and the order of categories and dishes as printed. Only invent categories if the menu has none.
- Include every dish and drink that has a price. If photos overlap and show the same dish twice, include it once.
- Leave out what isn't something to order: opening hours, Wi-Fi, addresses, phone numbers, slogans.

Albanian (sq) and English (en)
- Fill both languages for every name and description. Use the menu's own text for the language it is written in, and translate into the other.
- Traditional Albanian dishes and proper names keep their Albanian name in English too (Tavë kosi, Fërgesë, Byrek, Raki), as do brand names (Birrë Korça, Coca-Cola).
- Translate descriptions faithfully. Never invent a description or an ingredient: when the menu gives no description, both description texts are empty strings.

Prices
- price is the number printed for the dish, in the menu's currency, as a plain number (650, not "650 L"; 6.5 for "€6,50").
- When a dish has several prices for sizes or portions (0.33 l / 0.5 l, e vogël / e madhe, 6 / 10 copë), the dish price is the lowest one and you add a required choice: minSelect 1, maxSelect 1, one option per size, priceDelta 0 for the cheapest and the difference for the others.
- Paid extras or sides listed with a dish ("+ patate 150") become an optional group: minSelect 0, maxSelect the number of options.
- A price you can't read or that is missing: price null, and say so in warnings. Never guess a price.
- currency: ALL for lekë (L, Lek, Lekë, ALL), EUR for euro, other for anything else.

Allergens and tags (guests rely on these)
- allergens: only the ones the menu itself marks for that dish (numbers with a legend, icons or words), mapped to: gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs. Never infer an allergen from the dish name or ingredients; when the menu marks none, the list is empty.
- tags: vegetarian, spicy or new only when the menu marks them (a V or leaf symbol, "vegjetarian", a chili icon, "pikante", "e re" / "new").

warnings: short notes for the restaurant's setup, in English: unreadable or missing prices, a photo that is cut off or blurry, a service charge or cover charge on the menu, anything you were unsure of. Empty when there is nothing to report.`;

export interface ReadMenu {
  draft: MenuDraft;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Sends every source, labelled, to Claude and returns the menu it read. */
export async function readMenu(sources: MenuSource[], options: { apiKey: string; model?: string; fetch?: (url: string, init: RequestInit) => Promise<Response> }): Promise<ReadMenu> {
  const content: ContentBlock[] = sources.flatMap((source, i) => [{ type: 'text' as const, text: `Source ${i + 1} of ${sources.length}: ${source.label}` }, ...source.blocks]);
  content.push({ type: 'text', text: INSTRUCTIONS });
  const result = await callTool<MenuDraft>({
    ...options,
    system: SYSTEM,
    content,
    tool: { name: 'save_menu', description: "Saves the venue's whole menu in Urdho's format. Call it once, with every category and dish.", input_schema: DRAFT_SCHEMA },
  });
  return { draft: result.input, model: result.model, usage: result.usage };
}
