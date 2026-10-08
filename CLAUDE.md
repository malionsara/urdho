# Urdho: project rules

- Read docs/SPEC.md before any work. The MVP scope section is the limit: do not build anything listed as not in the MVP.
- Stack: TypeScript everywhere. React + Vite (PWA) front end, Hono API on Vercel Functions, PostgreSQL (Neon in production, Docker on the dev machine) through Drizzle, short polling for live updates, Vercel Blob for photos.
- Multi-tenant: every tenant-owned table has a venue_id column, child tables included, and every query filters by it. Venue comes from the staff session or the guest's table session, never from the request body. Another venue's IDs return 404. Add tests that prove venue A cannot read or change venue B's data.
- Tenancy and ordering tests run against a real PostgreSQL (the urdho_test database from Docker Compose), never a mocked database.
- Money is stored as integer lekë. The server computes every price; the client never sends prices. Order lines copy the price and the item and option names at order time.
- User-facing text goes through a translation layer from day one (sq, en first). Never hard-code Albanian or English strings in components. API errors return codes, and the web app translates them.
- Payments go through a PaymentProvider interface (createPayment, confirmPayment, refund). Only the cash provider exists in the MVP.
- Screens are designed first against mock data. Write tests for the ordering flow and tenancy before wiring screens to the real API.
- Ask before adding a dependency that is not in the stack above or the approved list below.

## Approved dependencies

- Tooling: pnpm, TypeScript, Vite, @vitejs/plugin-react, ESLint with typescript-eslint and eslint-plugin-react-hooks, Prettier, tsx, Vitest.
- Web: react, react-dom, react-router, @tanstack/react-query, i18next, react-i18next, vite-plugin-pwa, qrcode, @fontsource-variable/bricolage-grotesque, @fontsource-variable/inter, @testing-library/react, jsdom. Styling is CSS Modules with CSS variables; no CSS or UI framework.
- API: hono, @hono/node-server and @hono/vite-dev-server (local dev), drizzle-orm, drizzle-kit, pg, zod, @vercel/blob, @vercel/functions, sharp (photo resizing). Passwords use Node's built-in scrypt, no package.
- Type packages (@types/*) for anything above.

## Layout

- One package (no workspaces). /web: the Vite app, guest app and staff dashboard as separate route trees. /server: the Hono app, database, modules. /api: the Vercel Functions entry. /shared: types, enums and price maths used by web and server.
- Node 24, pnpm 10. Local PostgreSQL runs in Docker on host port 5433 (5432 is taken on the dev machine).
- Commands: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
