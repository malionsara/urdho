# Urdho: Restaurant Ordering SaaS for Albania, Product Spec

Oct 8, 2026 · @Malion Sara · revised Oct 8, 2026 before the build (see Revision notes)

## Revision notes

Changes from the first draft, made before the build starts. Revert any you disagree with.

- Name settled as **Urdho**. Domain still open.
- Hosting is Vercel with a Neon PostgreSQL database, to match how we already deploy. Vercel functions cannot hold WebSocket connections, so the API is Hono on Vercel Functions instead of NestJS, live updates poll every few seconds instead of using Socket.IO, and photos go to Vercel Blob.
- Build order: the guest app and dashboard are designed first against mock data, then the database and API are built and wired in.
- Data model: `order` renamed `guest_order` (ORDER is reserved in SQL); every tenant-owned table now carries `venue_id`, child tables included; order lines copy item and option names as well as prices; menu rows are archived instead of deleted; new fields for opening hours, time zone, default language, basket suggestions, the table session token and an order retry key; new `service_call` table for "Call the waiter".
- Guest phone number removed from the MVP. Nothing in the MVP uses it, and dropping it removes the legal check before launch. It returns with customer accounts in Phase 3.
- Table sessions open on the first scan. The first order of each session is flagged "New table" on the board so staff can check someone is actually seated.
- Kitchen printer support moved out of the MVP: orders arrive on screen.
- The dashboard gets a "Start service" tap that unlocks sound alerts and keeps the screen awake (browsers block sound until someone taps the page).
- Allergens use the fixed EU list of 14, with names translated by the app.
- Waiter-entered orders moved to "after the pilot, if needed".
- New top risk: staff re-keying app orders into the fiscal till.
- The two diagrams from the original document are written out as text. The roadmap timings did not survive the export and need re-entering.
- Claude Design brief updated to match (name-only checkout, no "coming soon" card).
- Guest app look (after the first design review): bold and photo-first in the spirit of the Nando's eat-in flow, with Urdho's own identity: Albanian kilim patterns, a dark navigation bar, a saffron accent, a chunky display font, and a cover photo per venue (`cover_url`).
- The project rules and kickoff prompt moved to `CLAUDE.md` and `docs/KICKOFF.md`.

## Overview

We are building a QR-based ordering product for Albanian restaurants: guests scan a code at the table, order from their phone, and pay in cash or by card, with no app to install.

- **Clients:** independent restaurants, cafés, beach bars and small chains, especially tourist-facing ones in Tirana and on the coast.
- **Why it can win:** pay-at-the-end by cash as the default, Albanian first with Italian, English and German, a flat subscription instead of commission, and card payments through local bank gateways.
- **Pricing assumption:** a flat monthly fee per venue. One existing QR menu service charges €12.99 per month with no commission ([doXmenu](https://www.doxmenu.com/qr-menu/albania/)), so we must beat it on ordering, not on menu display.
- **Reference experience:** the Nando's UK eat-in flow: menu, item customisation, basket with upsells, table number, guest checkout, loyalty.

## MVP scope

The MVP is dine-in ordering with pay-at-the-table. Online card payment, loyalty and pickup come after the first paying restaurants.

**In the MVP**

- Guest web app opened by a table QR code: menu, item options, basket, order submission, order status, call the waiter.
- Restaurant dashboard: live incoming orders on screen, status changes, waiter calls, menu and table management, QR code generation.
- Cash or card payment at the end of the meal, marked paid by staff.
- Albanian and English at launch, with the language system ready for Italian and German.
- One venue per account, with the data model already multi-tenant.

**Not in the MVP**

- Online card payment (Phase 2).
- Loyalty program, customer accounts and collecting guest phone numbers (Phase 3).
- Delivery, courier logistics and marketplace listing.
- Native mobile apps and inventory management.
- Kitchen printer integration: orders arrive on the dashboard screen.
- Waiter-entered orders (after the pilot, if needed).
- Fiscal receipt integration, until we confirm the legal requirement (see Compliance).

## Guest ordering flow

A guest goes from scan to submitted order in six screens, with no account and no app.

1. **Scan and land.** The QR code encodes the venue and table. The page opens already knowing both, opens or joins the table's session, and shows the venue logo, language switcher and menu categories as tabs.
2. **Menu.** Items show photo, name, short description, price in lekë, and badges (vegetarian, spicy, new). Sold-out items are greyed out and cannot be added.
3. **Item page.** Full description, allergen list, option groups (required choices like size, optional extras, remove-ingredient checkboxes), a quantity stepper and a live-price "Add to basket" button.
4. **Basket.** Shows the table, the line items with edit and remove, and a "Don't forget these…" carousel of one-tap add-ons: items the venue marked as basket suggestions (drinks, desserts, sides), skipping sold-out items and items already in the basket. A note field handles allergies and special requests. A line tells guests with serious allergies to confirm with staff.
5. **Checkout.** Guest checkout asking only for an optional name for the order. In the MVP there is one way to pay, "Pay at the end" (cash or card to the waiter); "Pay now by card" arrives in Phase 2. Submitting sends the order to the kitchen at once. If the connection drops, the app retries with the same order key, so the kitchen never receives it twice.
6. **Order status.** A page that updates live: received, preparing, served. Buttons let guests add more items to the same table session or call the waiter.

A table session opens on the first scan and stays open until staff close it. Everyone who scans that table while it is open joins the same session, and every order placed during the session adds to one running bill. A session with no orders closes itself after 2 hours.

## Restaurant dashboard

Staff run the whole service from one tablet or phone screen. A "Start service" tap at the start of a shift unlocks the sound alert for every new order and keeps the screen awake.

- **Live orders board:** columns for New, Preparing and Served. Each card shows the table, items with options and notes, and the time since the order arrived. One tap moves an order to the next column, and staff can cancel any order. The first order of each new table session is marked "New table" so staff can check someone is actually seated before the kitchen starts.
- **Waiter calls:** calls from guests appear at the top of the board with the table number until a waiter taps to acknowledge them.
- **Tables:** open table sessions with the running bill. Staff mark a table paid (cash or card) to close it, which resets its QR session.
- **Menu manager:** categories, items, photos, prices in lekë, option groups, allergens (from the EU list of 14), a basket-suggestion switch and a one-tap sold-out toggle. Texts are entered per language. Deleting an item archives it, so past orders keep their history.
- **QR codes:** generate and print one code per table, with the table number printed under the code.
- **Venue settings:** logo, cover photo, brand colour, opening hours, languages and default language.
- **Roles:** owner (everything, including staff accounts), manager (menu and tables), waiter (orders and tables only).
- **Staff accounts:** the owner creates manager and waiter accounts and sets their first password. During the pilot we create each venue and its owner with a command-line script.

## Payments

The MVP never touches money: the guest orders in the app and pays staff at the end. Card payment inside the app arrives in Phase 2, through a bank gateway.

| Option | How it works | Phase | Notes |
| --- | --- | --- | --- |
| Cash at the table | Staff collect cash and mark the table paid | MVP | Albania is still cash-heavy: non-cash payments average about 26 per person per year ([Bank of Albania via ATA](https://aman-alliance.org/Home/ContentDetail/102448)) |
| Card at the table | Waiter uses the venue's own POS or a phone terminal such as [RaiPOS](https://tapxphone.com/news/iba-group-and-rpc-launches-tapxphone-in-albania/) | MVP | No integration needed; the venue already has or is required to get a POS |
| Card in the app | Gateway from a local bank: raiAccept (Raiffeisen), or virtual POS from BKT, Credins or Fibank | Phase 2 | raiAccept has a sandbox and plugins for common shop platforms ([UEB](https://ueb.al/en/blog/online-payments-in-albania/)) |
| Payment link | The venue sends a bank-generated link for a bill | Phase 2 option | Raiffeisen's e-commerce service supports link generation ([Raiffeisen](https://www.raiffeisen.al/en/sme-businesses/products-and-services/se-business/pos-and-e-commerce-service.html)) |

**Fees are not public.** Banks quote per merchant and rates change often. Older Bank of Albania material cites merchant fees of 2-4% ([CEMLA deck](https://clon.cemla.org/actividades/2019-final/2019-11-semana-de-pagos/2019-11-semana-de-pagos-9.pdf)), and the Bank of Albania says it is cutting interchange fees. The first action is to request written merchant quotes and API terms from Raiffeisen, BKT and Credins.

**Design rule:** build a payment provider interface from day one (`createPayment`, `confirmPayment`, `refund`), with "cash" as the first provider, so adding a bank gateway later changes no ordering code. The cash provider records money taken by staff outside the app, whether in cash or on the venue's own card terminal; the payment's `method` says which.

**Tailwind:** card POS is already mandatory for transport and accommodation, and is expected to extend to all businesses by the end of 2026 ([Fiscal Requirements](https://www.fiscal-requirements.com/news/5656-albania-mandates-pos-terminals-for-transport-and-lodging-sectors-amid-industry-pushback)).

## Data model

Every tenant-owned table carries a `venue_id`, child tables such as options and order lines included, so one database serves many restaurants and every query filters by it. Prices are stored as whole lekë (integers), and user-facing texts live in a translation table keyed by language. Menu rows are archived (`archived_at`) rather than deleted, so order history always resolves.

| Entity | Key fields | Notes |
| --- | --- | --- |
| venue | id, name, slug, logo\_url, cover\_url, brand\_color, languages\[\], default\_language, timezone, opening\_hours, currency, plan, status | The tenant. The slug builds the guest URL. Time zone defaults to Europe/Tirane; opening hours are a weekly schedule |
| staff\_user | id, venue\_id, name, email, password\_hash, role | Roles: owner, manager, waiter |
| dining\_table | id, venue\_id, number, label, qr\_token | The QR token is random and resettable |
| menu\_category | id, venue\_id, sort\_order, active, archived\_at | Name comes from translations |
| menu\_item | id, venue\_id, category\_id, price\_lek, photo\_url, available, suggest\_in\_basket, tags\[\], allergens\[\], sort\_order, archived\_at | Name and description from translations. Tags are badges (vegetarian, spicy, new); allergens are codes from the EU list of 14 |
| option\_group | id, venue\_id, item\_id, min\_select, max\_select, sort\_order, archived\_at | Covers sizes, extras and remove-ingredient lists |
| option | id, venue\_id, group\_id, price\_delta\_lek, available, sort\_order, archived\_at | Name from translations |
| translation | id, venue\_id, entity\_type, entity\_id, field, lang, text | One row per text per language. A missing language falls back to the venue's default language |
| table\_session | id, venue\_id, table\_id, status, token\_hash, opened\_at, closed\_at | Groups all orders at a table until paid. Guests hold the session token in a cookie; only its hash is stored |
| guest\_order | id, venue\_id, session\_id, client\_ref, status, guest\_name, note, created\_at | Status: new, preparing, served, cancelled. `client_ref` is a key made on the guest's phone, unique per session, so a retried submission never creates a second order |
| order\_item | id, venue\_id, order\_id, item\_id, item\_name, qty, unit\_price\_lek, note | Name (in every venue language) and price copied at order time so later menu edits never change history |
| order\_item\_option | id, venue\_id, order\_item\_id, option\_id, option\_name, price\_delta\_lek | Selected options per line, with name and price copied |
| service\_call | id, venue\_id, session\_id, table\_id, created\_at, acknowledged\_at, acknowledged\_by | "Call the waiter" |
| payment | id, venue\_id, session\_id, provider, method, amount\_lek, status, provider\_ref | Provider is cash in the MVP; method is cash or card |

Phase 3 adds `customer` (phone, name, consent) and `loyalty_ledger` (customer\_id, venue\_id, points, created\_at).

## Architecture and stack

One TypeScript codebase serves both apps: a React front end for guests and staff, a Hono API running as Vercel Functions, and PostgreSQL on Neon, with live order updates by short polling. The choices below are picked to match how we already deploy.

```
Guest web app ────┐                                      ┌── PostgreSQL (Neon)
                  ├── HTTPS (polls for updates) ── API ──┼── Photo storage (Vercel Blob)
Staff dashboard ──┘                                      └╌╌ Bank gateway (Phase 2)
```

Both apps talk only to the API, which owns tenancy, orders and payments. The dotted line is the bank gateway added in Phase 2.

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React + Vite, installable as a PWA | Loads fast on phones; staff can install it on a tablet |
| API | Hono (TypeScript) on Vercel Functions | Small and quick to start, which matters on serverless; easy to test without running a server |
| Database | PostgreSQL: Neon in production, Docker on the dev machine | Transactions for orders and payments; row-level security later as a safety net; Neon branches for preview deploys |
| Live updates | Short polling behind one interface: the board every 3 seconds, the guest status page every 5 | Works on Vercel with no extra service. A push service (Pusher, Ably or Upstash) can replace it later without touching the screens |
| Staff auth | Email and password with session tokens, role checks per route | Three roles, no social login needed |
| Guest identity | None; a table session token in a cookie | Keeps ordering to one scan and no signup |
| Photos | Vercel Blob | Lives next to the app; resized on upload |
| Hosting | Vercel (web app and API) with Neon | One project, a preview deploy per branch. Vercel's free Hobby plan is for non-commercial use, so paying venues need the Pro plan |

**Tenancy.** The guest URL carries the venue slug and the table's QR token. The token only opens the right venue and table: scanning it opens or joins the table's session and stores the session token in a cookie, and ordering needs that session token. The session token stops working when staff close the table. Staff can reset a table's QR token if a code leaks.

**Abuse limits.** Rate-limit order submission per session, refuse orders outside opening hours, flag the first order of each new session as "New table" on the board, and let staff cancel any order from the board.

## Languages, branding and compliance

The product must read as native Albanian and look like each restaurant's own brand, while leaving legal receipts to the venue's existing systems until we confirm otherwise.

- **Languages:** Albanian and English at launch, Italian and German next, chosen by a switcher on the guest page. Restaurants enter their own texts per language; an AI-assisted translation draft can fill gaps, but the owner approves it.
- **Branding:** per-venue logo and one brand colour, applied to the guest app. The product name stays small in the footer.
- **Currency:** lekë only, shown without decimals. Foreign guests see the same prices; no conversion in the MVP.
- **Personal data:** the MVP collects only an optional name for the order, and no phone numbers. Before Phase 3 (customer accounts and loyalty), check the rules on guest data with an Albanian lawyer and set a retention period for phone numbers.
- **Fiscal receipts (to verify):** in the MVP the venue issues the fiscal receipt on its own till when the table pays, so the product holds no fiscal duty. This means staff re-key app orders into the till at payment time (see Risks). Before Phase 2 online payments, confirm with an Albanian accountant whether the product must issue or link fiscal receipts.
- **Allergens:** allergens are codes from the EU list of 14, with names translated by the app. Show them exactly as the venue sets them, with a standing note that staff must confirm for serious allergies.

## Phases and milestones

Build in three phases and start the next only when its gate is met. Before milestone 1, interview 10 owners and line up 3 pilot venues.

1. **Phase 1, MVP:** dine-in ordering with pay-at-the-table, as scoped above.
   - *Gate to Phase 2:* three pilot venues order at every service, and written bank quotes are in hand.
2. **Phase 2, card in the app:** a bank gateway behind the payment provider interface, with payment links as an option.
   - *Gate to Phase 3:* five venues pay, and card works at two.
3. **Phase 3, loyalty:** customer accounts and the loyalty ledger.

Timings are estimates for two people working part-time. *To re-enter: the estimates in the original roadmap diagram did not survive the export.*

## Risks and open questions

The biggest risk is not technical: it is whether restaurant owners will pay a monthly fee for ordering. Test that before building past the MVP.

| Risk | Mitigation |
| --- | --- |
| Staff must re-key every app order into the fiscal till at payment time, which may cost more time than the app saves | Ask about it in all 10 owner interviews; time it during the pilot; look at fiscal software integration before Phase 2 |
| Owners will not pay for ordering when QR menus are cheap or free | Interview 10 owners first; run a free first month with 3 to 5 pilot venues and measure orders per table |
| Guests do not scan, or prefer a waiter | Printed table stands; pay-at-the-end default; staff keep taking orders the usual way for those guests (waiter-entered orders in the app after the pilot, if needed) |
| Remote prank orders from a photographed QR code | "New table" flag on the board, rate limits, opening hours, staff cancel; reset the table's QR token if a code leaks |
| Card fees of a few percent hurt small venues | Cash stays first-class; card in the app is optional per venue; negotiate bank quotes before Phase 2 |
| Delivery apps and QR menu tools already exist | Compete on dine-in ordering, upsells and Albanian support, not on delivery or menu display |
| Fiscal and data rules are misread | Get written confirmation from an Albanian accountant and a lawyer before Phase 2 and before collecting phone numbers in Phase 3 |
| Poor connectivity in beach bars and rural venues | Cache the menu in the PWA; retry order submission with the same order key; staff fall back to taking orders by hand |
| Two people with day jobs cannot support many venues | Cap the pilot at 5 venues; support by WhatsApp; keep the MVP to the scope above |

**Open questions**

- [x] Product name: Urdho
- [ ] Domain
- [ ] Price per venue per month, and whether to offer an annual plan
- [ ] The first 3 to 5 pilot venues and who approaches them
- [ ] Does re-keying orders into the fiscal till put owners off? (ask in the interviews)
- [ ] Which bank gateway to start with, after quotes
- [ ] Accountant's answer on fiscal receipts for online payments

## Brief for Claude Design

Paste this into Claude Design to get the guest screens and the staff dashboard as artboards. Albanian strings are drafts for a native speaker to check.

```markdown
Design a mobile-first restaurant ordering web app for Albanian restaurants. Guests scan a QR code at the table, order from their phone, and pay the waiter at the end. No app download, no account. The product is called Urdho, but each screen carries the restaurant's brand; Urdho appears only small in the footer.

BRAND SYSTEM
- One themable brand colour per restaurant, applied to buttons, badges and accents. Show the demo in a warm terracotta, and include one alternate theme in deep green to prove it works.
- Warm, appetising, food-first. Large photography, generous spacing, rounded corners, one friendly display font for headings and one clean sans for body. Light theme first.
- Do not copy any existing restaurant chain's look or branding.

GUEST SCREENS (390 px wide)
1. Menu: venue logo, language switcher (SQ / EN / IT / DE), category tabs that stay at the top while scrolling, item rows with photo, name, 2-line description, price, and badges (vegetarian, spicy, new). Include one sold-out item, greyed out. A floating basket bar at the bottom: item count and total.
2. Item page: hero photo, name, description, price, link to allergens, option groups (a required size choice, optional extras, remove-ingredient checkboxes), quantity stepper, and a full-width "Add to basket" button showing the live price.
3. Basket: header showing "Tavolina 7", line items with quantity controls, a "Don't forget these..." row of one-tap add-ons, a note field for allergies, and a small notice to confirm serious allergies with staff. Also design the empty state.
4. Checkout: an optional name field, a clear note that the guest pays the waiter at the end by cash or card ("Paguaj në fund"), and a total with a "Porosit" (Order) button.
5. Order status: a live timeline (Received, Preparing, Served), the order summary, and two buttons: "Shto edhe" (Add more) and "Thirr kamarierin" (Call the waiter).

STAFF DASHBOARD (tablet, 1024 px landscape)
6. Live orders board: three columns (New, Preparing, Served). Each card shows table number, time since it arrived, items with options and notes, and one large action button. Make new orders stand out, and mark the first order from a newly seated table as "New table". Waiter calls sit in a strip at the top until acknowledged. Include the "Start service" screen shown at the start of a shift.
7. Menu manager: category list on the left, item list in the middle, edit panel on the right with texts per language, price in lekë, photo, option groups, allergens, a "suggest in basket" switch and a sold-out switch.

CONTENT
- Use realistic Albanian dishes and prices in lekë, for example: Tavë kosi 850 L, Fërgesë Tirane 700 L, Qofte të fshira 600 L, Byrek me spinaq 250 L, Salcë kosi 150 L, Baklava 300 L, Birrë Tirana 300 L.
- Show prices as "850 L" with no decimals.

DELIVER
- Artboards for all seven screens, plus the sold-out, empty-basket and loading states.
- A small design system: colour tokens (brand, surface, text, success, warning), type scale, spacing, button, badge, card and input components.
```

## Build setup

The project rules live in `CLAUDE.md` at the repo root, the build prompt in `docs/KICKOFF.md`, and the implementation plan in `docs/PLAN.md`.

## Sources

Search results read on 8 October 2026. I could not open the Nando's site (it blocks automated access), so the reference flow comes from your screenshots.

- [UEB: online payments in Albania](https://ueb.al/en/blog/online-payments-in-albania/)
- [Raiffeisen Albania: POS and e-commerce service](https://www.raiffeisen.al/en/sme-businesses/products-and-services/se-business/pos-and-e-commerce-service.html)
- [RaiPOS launch (tapXphone)](https://tapxphone.com/news/iba-group-and-rpc-launches-tapxphone-in-albania/)
- [Fiscal Requirements: POS mandate for transport and lodging](https://www.fiscal-requirements.com/news/5656-albania-mandates-pos-terminals-for-transport-and-lodging-sectors-amid-industry-pushback)
- [ATA via AMAN: Bank of Albania on POS expansion](https://aman-alliance.org/Home/ContentDetail/102448)
- [CEMLA: Albania payments report](https://clon.cemla.org/actividades/2019-final/2019-11-semana-de-pagos/2019-11-semana-de-pagos-9.pdf)
- [doXmenu: QR menu for Albania](https://www.doxmenu.com/qr-menu/albania/)
