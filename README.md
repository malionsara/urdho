# Urdho

QR ordering for Albanian restaurants: guests scan a code at the table, order from their phone and pay staff at the end. See [docs/SPEC.md](docs/SPEC.md) for the product, [docs/PLAN.md](docs/PLAN.md) for the build plan and [CLAUDE.md](CLAUDE.md) for the project rules.

## Status

Milestones 1 to 3 of 9: the repo, the design system, the guest app and the staff dashboard, all on **demo data**. There is no server or database yet. Instead, a mock backend in the browser's local storage (`web/src/mock/`) follows the spec's data model, and the guest app and the dashboard share it: an order placed in one tab appears on the board in another, and status changes on the board reach the guest's status page.

## Run it

Requires Node 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 for the design-review page, which links to every screen and state and can fill the board with a demo service. Open the guest app in a phone-width window (390 px) and the dashboard at tablet size (1024 × 768), or use real devices on the same network with `pnpm dev --host`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with hot reload |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm build` | Production build into `dist/` |

## Demo data

- Venue: *Tavë & Raki* (fictional), slug `demo`, Albanian and English.
- Photos in `web/public/demo/` are AI-generated for the demo (12 dishes and a cover, each as an 800 px and a 400 px WebP). They are not photos of a real restaurant's food; pilot venues use their own.
- Tables 1 to 6: `/demo/t/demo-1` … `/demo/t/demo-6`. Any other code shows the "code no longer active" screen.
- Staff: `/staff`, with one-tap demo accounts for each role (any password works in the mock):

  | Role | Email | Sees |
  | --- | --- | --- |
  | Owner | pronari@demo.al | Everything |
  | Manager | menaxheri@demo.al | Orders, tables, menu, QR codes |
  | Waiter | kamarieri@demo.al | Orders, tables |

- Review switches, remembered for the browser tab: `?brand=1F5E45` previews another brand colour (`?brand=reset` clears it), `?slow=1` slows the demo data to show loading states (`?slow=0` clears it).

## Layout

```
web/src/guest   Guest app: menu, item, basket, checkout, order status
web/src/staff   Staff dashboard: live board, tables, menu manager, QR cards, staff, settings
web/src/mock    Mock backend in localStorage, shaped like the spec's data model
web/src/ui      Design system: buttons, badges, fields, kilim pattern, icons
web/src/i18n    UI strings (sq, en)
shared/         Types, allergens, price maths and lekë formatting shared with the future API
docs/           Spec, kickoff prompt, plan
```

## Look and feel

Bold and photo-first, in the spirit of the Nando's eat-in ordering flow but with its own identity: Albanian kilim patterns (`web/src/ui/Kilim.tsx`), a warm near-black and saffron palette, Bricolage Grotesque for headlines and Inter for text.

Design tokens live in `web/src/styles/tokens.css`. Each venue's brand colour is applied at runtime by `web/src/lib/brand.ts`, which also picks a readable text colour for it; the kilim bands, tabs and buttons all follow it, in the guest app and the dashboard alike.

## Sound on the dashboard

Browsers only play sound after someone taps the page, so the board opens on a "Start service" screen. That tap unlocks the new-order chime (two rising notes) and the waiter-call chime (three quick notes), synthesised with the Web Audio API so there is no audio file to load, and asks the screen to stay awake. After a reload, the tap is needed again.
