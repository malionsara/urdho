# Urdho

QR ordering for Albanian restaurants: guests scan a code at the table, order from their phone and pay staff at the end. See [docs/SPEC.md](docs/SPEC.md) for the product, [docs/PLAN.md](docs/PLAN.md) for the build plan and [CLAUDE.md](CLAUDE.md) for the project rules.

## Status

Milestones 1 to 6 of 9: the repo, the design system, the guest app, the staff dashboard, the PostgreSQL database, and the API's staff sign-in, roles, tenancy and menu management with photo uploads.

The screens still run on **demo data**: a mock backend in the browser's local storage (`web/src/mock/`), shaped like the spec's data model and shared by the guest app and the dashboard. An order placed in one tab appears on the board in another, and status changes on the board reach the guest's status page. The real API is growing underneath (`server/`); milestone 8 switches the screens over to it.

## Run it

Requires Node 24, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:reset
pnpm dev
```

`pnpm db:up` starts PostgreSQL in Docker on port 5433; `pnpm db:reset` builds the tables and seeds the demo venue, with its three staff accounts when `DEMO_STAFF_PASSWORD` is set in `.env`. `pnpm dev` serves the web app and, under `/api`, the API.

Open http://localhost:5173 for the design-review page, which links to every screen and state and can fill the board with a demo service. Open the guest app in a phone-width window (390 px) and the dashboard at tablet size (1024 × 768), or use real devices on the same network with `pnpm dev --host`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with hot reload |
| `pnpm test` | All tests. The database tests need `pnpm db:up` first |
| `pnpm test:unit` | Only the tests that need no database |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm build` | Production build into `dist/` |
| `pnpm db:up` / `db:down` | Start / stop PostgreSQL in Docker |
| `pnpm db:reset` | Wipe the local database, apply migrations, seed the demo venue (local databases only) |
| `pnpm db:migrate` | Apply new migrations |
| `pnpm db:seed` | Replace the demo venue, leaving other data alone |
| `pnpm db:generate` | Write a migration after changing `server/db/schema.ts` |
| `pnpm db:studio` | Browse the data in Drizzle Studio |
| `pnpm venue:create` | Create a pilot venue, its tables and its owner; prints the owner's temporary password once |

## API

Hono, in `server/`. In development it runs inside `pnpm dev` at http://localhost:5173/api; on Vercel it will run as a function (milestone 9).

| Route | Who | What |
| --- | --- | --- |
| `POST /api/staff/login` | anyone | Email and password; sets the session cookie |
| `POST /api/staff/logout` | signed in | Ends this device's session |
| `GET /api/staff/me` | signed in | The account and its venue |
| `POST /api/staff/password` | signed in | Change password; signs out other devices |
| `GET /api/staff/team` | owner | Staff accounts of the venue |
| `POST /api/staff/team` | owner | New account with a temporary password, shown once |
| `DELETE /api/staff/team/:id` | owner | Remove an account and end its sessions |
| `GET /api/staff/venue` | signed in | Venue settings |
| `PUT /api/staff/venue` | owner | Change venue settings |
| `GET /api/staff/menu` | owner, manager | Categories and dishes with option groups, texts per language |
| `POST /api/staff/menu/categories` | owner, manager | New category |
| `PATCH /api/staff/menu/categories/:id` | owner, manager | Rename, show or hide a category |
| `DELETE /api/staff/menu/categories/:id` | owner, manager | Archive an empty category |
| `POST /api/staff/menu/items` | owner, manager | New dish with its option groups |
| `PUT /api/staff/menu/items/:id` | owner, manager | Save a whole dish; options left out are archived |
| `PATCH /api/staff/menu/items/:id/availability` | owner, manager | Sold-out switch |
| `DELETE /api/staff/menu/items/:id` | owner, manager | Archive a dish |
| `POST /api/staff/uploads?kind=dish\|cover\|logo` | owner, manager (dish), owner (cover, logo) | Photo upload, multipart field `file`; returns `{ url }` |

Removing anything on the menu archives it, so past orders keep pointing at real rows; their names and prices were copied when ordered. Photos are checked to be images, turned upright, stripped of metadata and stored as WebP in two sizes (`name.webp` and `name-400.webp`, or `-600` for covers): in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise in `web/public/uploads/`, which `pnpm dev` serves and git ignores.

Sessions are an httpOnly, SameSite=Strict cookie limited to `/api`, valid for 30 days; the database stores only a hash of the token. Accounts created with a temporary password can only change it, sign out or ask who they are until they choose their own. Errors come back as `{ "error": { "code": "…" } }`; the web app translates the codes.

Create a pilot venue:

```bash
pnpm venue:create --name "Venue name" --slug venue-name --owner-name "Full Name" --owner-email owner@example.com --tables 8
```

## Database

The schema in `server/db/schema.ts` follows the data model in the spec; migrations in `server/db/migrations/` are generated from it and committed. Tenancy is enforced twice: every query will filter by `venue_id` (milestone 5), and underneath that the database links child rows to parents through `(id, venue_id)` together, so a row can never point at another venue's data. `server/db/schema.test.ts` proves those rules against a real PostgreSQL. The tests use a separate `urdho_test` database that each run wipes and rebuilds.

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
server/         Hono API: app.ts, routes/, repos/ (all queries, scoped by venue), auth/ (passwords, sessions)
server/db       Drizzle schema, migrations, seed and reset scripts
shared/         Types, allergens, price maths, lekë formatting and the demo menu, shared by web and server
docs/           Spec, kickoff prompt, plan
```

## Look and feel

Bold and photo-first, in the spirit of the Nando's eat-in ordering flow but with its own identity: Albanian kilim patterns (`web/src/ui/Kilim.tsx`), a warm near-black and saffron palette, Bricolage Grotesque for headlines and Inter for text.

Design tokens live in `web/src/styles/tokens.css`. Each venue's brand colour is applied at runtime by `web/src/lib/brand.ts`, which also picks a readable text colour for it; the kilim bands, tabs and buttons all follow it, in the guest app and the dashboard alike.

## Sound on the dashboard

Browsers only play sound after someone taps the page, so the board opens on a "Start service" screen. That tap unlocks the new-order chime (two rising notes) and the waiter-call chime (three quick notes), synthesised with the Web Audio API so there is no audio file to load, and asks the screen to stay awake. After a reload, the tap is needed again.
