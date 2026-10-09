# Urdho

QR ordering for Albanian restaurants: guests scan a code at the table, order from their phone and pay staff at the end. See [docs/SPEC.md](docs/SPEC.md) for the product, [docs/PLAN.md](docs/PLAN.md) for the build plan and [CLAUDE.md](CLAUDE.md) for the project rules.

## Status

All 9 milestones of the MVP plan: the design system, the guest app, the staff dashboard, the PostgreSQL database, the API (staff sign-in, roles and tenancy, menu management with photo uploads, ordering from scan to payment), the screens wired to it with polling, an offline menu and an installable dashboard, and the deploy.

Live at **https://urdho.vercel.app** (Vercel, with Neon PostgreSQL and Vercel Blob in Frankfurt).

An order placed on a phone appears on the board within seconds; status changes on the board, sold-out switches and payment reach the phone the same way.

## Run it

Requires Node 24, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:reset
pnpm dev
```

`pnpm db:up` starts PostgreSQL in Docker on port 5433; `pnpm db:reset` builds the tables and seeds the demo venue, with its three staff accounts when `DEMO_STAFF_PASSWORD` is set in `.env`. `pnpm dev` serves the web app and, under `/api`, the API. It reads `.env` when it starts, so restart it after changing `.env`.

Open http://localhost:5173 for the design-review page, which links to every screen and state and can fill the board with a demo service. Open the guest app in a phone-width window (390 px) and the dashboard at tablet size (1024 × 768), or use real devices on the same network with `pnpm dev --host`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with hot reload |
| `pnpm test` | All tests. The database tests need `pnpm db:up` first |
| `pnpm test:unit` | Only the tests that need no database |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm build` | Production build: the web app into `dist/`, the API into `server/dist/vercel.js` |
| `pnpm deploy:build` | What Vercel runs: build, migrate, seed the demo venue if asked |
| `pnpm db:up` / `db:down` | Start / stop PostgreSQL in Docker |
| `pnpm db:reset` | Wipe the local database, apply migrations, seed the demo venue (local databases only) |
| `pnpm db:migrate` | Apply new migrations |
| `pnpm db:seed` | Replace the demo venue, leaving other data alone |
| `pnpm db:generate` | Write a migration after changing `server/db/schema.ts` |
| `pnpm db:studio` | Browse the data in Drizzle Studio |
| `pnpm venue:create` | Create a pilot venue, its tables and its owner; prints the owner's temporary password once |

## Deploy

The private GitHub repo `malionsara/urdho` is linked to the Vercel project `urdho` (team MNP Team): every push to `main` deploys to https://urdho.vercel.app, and the previous version keeps serving until the new one is ready. A build runs `pnpm deploy:build`:

1. `pnpm build`: the web app into `dist/`, and the API into one file, `server/dist/vercel.js`, which `api/index.js` hands to Vercel.
2. `pnpm db:migrate`: new migrations on Neon. A failing migration fails the deploy, so the live site never runs code against a schema it doesn't expect.
3. `pnpm db:seed --on-deploy`: creates the demo venue only if `DEMO_STAFF_PASSWORD` is set on the project and the venue doesn't exist yet. It never overwrites anything, except replacing a public `demo-N` table code with a private one.

`vercel.json` sends `/api/*` to the function (in `fra1`, Frankfurt, next to the database) and every other app address to `index.html`, except `/assets/`, where a missing file is a real 404. Built files are cached for a year; the service worker and manifest are always revalidated.

Settings on the Vercel project:

| Variable | Set by | Used for |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (and Neon's other `PG*`/`POSTGRES_*` variables) | Neon integration | The app uses the pooled address; migrations and the seed the direct one |
| `BLOB_READ_WRITE_TOKEN` | Blob store `urdho-photos` (public, Frankfurt) | Photo uploads. Required in production: a function's disk can't keep files |
| `GUEST_SESSION_SECRET` | Random, Sensitive | Signs the guests' table cookies. Changing it moves every phone to a fresh session at its table |
| `DEMO_STAFF_PASSWORD` | Optional, Sensitive, production only | The demo accounts' starting password (see [Demo data](#demo-data)). Safe to delete once the demo venue exists |

Sensitive values can't be read back, not even by the project's owners. Previews deploy from other branches behind Vercel sign-in.

A real venue: copy the direct connection string from the Neon dashboard (Vercel → Storage → urdho → Open in Neon), then run `pnpm venue:create` with it as `DATABASE_URL`. The owner's temporary password is printed once; they choose their own at first sign-in.

## API

Hono, in `server/`. In development it runs inside `pnpm dev` at http://localhost:5173/api; on Vercel it runs as one function (see [Deploy](#deploy)).

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
| `GET /api/staff/board` | signed in | Live board: new and preparing orders, served ones from the last 90 minutes, unanswered waiter calls |
| `PATCH /api/staff/orders/:id` | signed in | `preparing`, `served` or `cancelled`; only forward, never back from served |
| `POST /api/staff/calls/:id/acknowledge` | signed in | "On my way" |
| `GET /api/staff/tables` | signed in | Every table with its open session, orders and running bill |
| `POST /api/staff/sessions/:id/pay` | signed in | `{ method: "cash" \| "card" }`: records the payment through the cash provider and closes the table |
| `POST /api/staff/sessions/:id/close` | signed in | Clears a table with nothing to pay |
| `GET /api/staff/qr` | owner, manager | Tables with their QR tokens, for printing cards |
| `POST /api/staff/tables` | owner, manager | Add a table |
| `POST /api/staff/tables/:id/reset-qr` | owner, manager | New QR code for a table; the old one stops working |

Guests address the API through their table's QR code, `/api/guest/:slug/t/:qrToken`:

| Route | What |
| --- | --- |
| `POST …/scan` | Opens or joins the table's session; returns the menu and whether ordering is open now |
| `POST …/orders` | `{ clientRef, guestName, note, lines: [{ itemId, qty, optionIds }] }`; the server prices it. A repeated `clientRef` returns the first order |
| `GET …/orders/:id` | The order's status and lines, with the table's running bill. Once the table is paid: `session_closed` |
| `POST …/calls` | Call the waiter; repeat taps don't ring again |

Everyone who scans a table shares one session until staff take payment or close it. The guest cookie is limited to that table's address, so a phone that scanned two tables can't order to the wrong one. Orders are refused outside the venue's opening hours (its own time zone; a venue with no hours set is always open), when a dish has sold out since the guest opened it (`menu_changed`), when option rules are broken, and after 10 orders from one table in 10 minutes. An empty session closes itself after two hours.

Removing anything on the menu archives it, so past orders keep pointing at real rows; their names and prices were copied when ordered. Photos are checked to be images, turned upright, stripped of metadata and stored as WebP in two sizes (`name.webp` and `name-400.webp`, or `-600` for covers): in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise in `web/public/uploads/`, which `pnpm dev` serves and git ignores.

Sessions are an httpOnly, SameSite=Strict cookie limited to `/api`, valid for 30 days; the database stores only a hash of the token. Accounts created with a temporary password can only change it, sign out or ask who they are until they choose their own. Password guessing is slowed down in PostgreSQL: after 5 wrong sign-ins for one account from one address within 15 minutes (or 50 for one account from anywhere, or 30 from one address across accounts), sign-in answers `too_many_attempts` until the window passes; the real owner signing in from elsewhere is never locked out. Errors come back as `{ "error": { "code": "…" } }`; the web app translates the codes.

Create a pilot venue:

```bash
pnpm venue:create --name "Venue name" --slug venue-name --owner-name "Full Name" --owner-email owner@example.com --tables 8
```

## Database

The schema in `server/db/schema.ts` follows the data model in the spec; migrations in `server/db/migrations/` are generated from it and committed. Tenancy is enforced twice: every query filters by `venue_id`, and underneath that the database links child rows to parents through `(id, venue_id)` together, so a row can never point at another venue's data. `server/db/schema.test.ts` proves those rules against a real PostgreSQL. The tests use a separate `urdho_test` database that each run wipes and rebuilds.

## Demo data

- Venue: *Tavë & Raki* (fictional), slug `demo`, Albanian and English.
- Photos in `web/public/demo/` are AI-generated for the demo (12 dishes and a cover, each as an 800 px and a 400 px WebP). They are not photos of a real restaurant's food; pilot venues use their own.
- Tables 1 to 6: `/demo/t/demo-1` … `/demo/t/demo-6`. Any other code shows the "code no longer active" screen.
- Staff: `/staff`. The seed creates one account per role with `DEMO_STAFF_PASSWORD` from `.env`; the login screen of `pnpm dev` offers them as one-tap buttons. Production builds never contain that password or the buttons.

  | Role | Email | Sees |
  | --- | --- | --- |
  | Owner | pronari@demo.al | Everything |
  | Manager | menaxheri@demo.al | Orders, tables, menu, QR codes |
  | Waiter | kamarieri@demo.al | Orders, tables |

- Review switches, remembered for the browser tab: `?brand=1F5E45` previews another brand colour (`?brand=reset` clears it), `?slow=1` slows every API call to show loading states (`?slow=0` clears it).
- To start over with a clean demo venue: `pnpm db:reset`.
- On https://urdho.vercel.app the demo venue exists too, open 08:00–23:00 Tirana time. Its three accounts start with the password in `.env.vercel-demo` (git-ignored, on the machine that set up the deploy) and must each replace it at first sign-in. Its tables don't use the public `demo-1` … `demo-6` codes: off this machine the seed gives them random ones, and every deploy replaces any public code still there. Print or scan them from QR codes in the dashboard.

## Live updates and weak signal

Short polling, no sockets: the board and the tables screen ask every 3 seconds, a guest's order status every 5 seconds until it is served, and an open menu every minute (so sold-out dishes grey out). Polling pauses while a tab is hidden or a phone is locked and catches up as soon as it is visible again.

The phone keeps the last menu it loaded. Without a connection the guest still sees it, with a "no internet" banner, and ordering waits for the connection. An order that was sent but got no answer is retried with the same `clientRef`, so the kitchen never gets it twice. A dish that sold out in the meantime is taken out of the basket by name, and after payment the status page says the table is closed.

## Install on a tablet

The staff dashboard is a PWA: in Chrome or Edge use the install button in the address bar, on an iPad Safari's Share → Add to Home Screen. It opens straight to `/staff`, full screen. Only the dashboard links the install manifest (`web/public/staff.webmanifest`), so guests are never offered to install it.

Production builds add a service worker (none in `pnpm dev`): it keeps the guest app's shell and fonts and every photo it has shown, so repeat visits load on a weak signal; the dashboard's files are cached the first time a staff device opens it. It never touches `/api`. A new version takes over by itself, without reloading an open board (a reload would silence the chime until someone taps "Start service" again). Service workers need HTTPS, or `localhost`; try one locally with `pnpm build` and `pnpm exec vite preview`.

## Layout

```
web/src/guest   Guest app: menu, item, basket, checkout, order status
web/src/staff   Staff dashboard: live board, tables, menu manager, QR cards, staff, settings
web/src/ui      Design system: buttons, badges, fields, kilim pattern, icons
web/src/i18n    UI strings (sq, en)
server/         Hono API: app.ts, routes/, repos/ (all queries, scoped by venue), auth/ (passwords, sessions);
                vercel.ts is the production entry, dev-entry.ts the one `pnpm dev` loads
api/            Vercel's entry: index.js exports the bundled API
server/db       Drizzle schema, migrations, seed and reset scripts
shared/         Types, allergens, price maths, lekë formatting and the demo menu, shared by web and server
docs/           Spec, kickoff prompt, plan
```

## Look and feel

Bold and photo-first, in the spirit of the Nando's eat-in ordering flow but with its own identity: Albanian kilim patterns (`web/src/ui/Kilim.tsx`), a warm near-black and saffron palette, Bricolage Grotesque for headlines and Inter for text.

Design tokens live in `web/src/styles/tokens.css`. Each venue's brand colour is applied at runtime by `web/src/lib/brand.ts`, which also picks a readable text colour for it; the kilim bands, tabs and buttons all follow it, in the guest app and the dashboard alike.

## Motion

Screens change with View Transitions (`web/src/lib/motion.ts`, styles in `web/src/styles/global.css`): the next screen slides in and going back slides the other way; a dish photo grows from its menu card into the dish page and shrinks back; the bottom bar and top bar stay put and change in place; basket lines close up when one is removed; order cards glide to their next column on the board, which updates the moment a card is tapped and goes back if the server refuses. Smaller touches: dishes rise in on the first visit, photos fade in as they arrive, counts bump and totals roll.

Links get it with React Router's `viewTransition`; in-screen changes go through `animateChange()`. Dashboard pages are nested routes, whose links can't carry the option, so the rail asks the router directly. Browsers without View Transitions switch screens instantly. With "reduce motion" switched on (on Windows: Settings → Accessibility → Visual effects → Animation effects off) screens only cross-fade, and nothing slides, grows or glides.

## Sound on the dashboard

Browsers only play sound after someone taps the page, so the board opens on a "Start service" screen. That tap unlocks the new-order chime (two rising notes) and the waiter-call chime (three quick notes), synthesised with the Web Audio API so there is no audio file to load, and asks the screen to stay awake. After a reload, the tap is needed again.
