# Urdho MVP: implementation plan

Status: **approved Oct 8, 2026.** The owner left the technical choices to Claude, with two constraints: deploy like other projects (Vercel, with Neon or Upstash), and design first, logic second.

## Repo layout

```
/web      React + Vite PWA. Guest app at /:slug/t/:qrToken, staff dashboard at /staff (lazy-loaded, so guests never download it)
/server   Hono app: database (Drizzle), repositories, modules for auth, menu, sessions, orders, payments
/api      Vercel Functions entry that hands every /api request to the Hono app
/shared   Types, enums (roles, statuses, the 14 allergens), price maths and formatting used by web and server
/docs     SPEC.md, KICKOFF.md, PLAN.md
docker-compose.yml   Local PostgreSQL on port 5433 with urdho (dev) and urdho_test databases
```

One package, no workspaces: simpler for two people, and Vercel builds it as one project.

## Key decisions

1. **Design first.** Milestones 2 and 3 build the real screens on mock data behind the same data hooks the API will use, so wiring them later only swaps the data source.
2. **Hosting:** Vercel serves the web app and runs the Hono API as functions; Neon hosts PostgreSQL; Vercel Blob stores photos. Locally, PostgreSQL runs in Docker and the API runs inside the Vite dev server, so `pnpm dev` starts everything.
3. **Live updates:** short polling (board every 3 seconds, guest status every 5) through TanStack Query, behind one interface. If the pilot needs instant push, Pusher, Ably or Upstash can replace it without touching screens.
4. **Database access:** Drizzle with node-postgres, the same driver locally and on Neon's pooled connection. Every repository function takes `venueId` first, so no query path exists without it.
5. **Tenancy:** staff get their venue from their login session, guests from the slug and QR token or their table-session cookie, never from the request body. Another venue's IDs return 404. The isolation suite seeds two venues and calls every endpoint with venue A's credentials against venue B's IDs.
6. **Staff auth:** email and password hashed with Node's built-in scrypt; an opaque token in an httpOnly, SameSite=Strict cookie, with only its hash stored in a `staff_session` table.
7. **Guest sessions:** `POST /api/guest/scan` with the slug and QR token opens or joins the table's session and sets an httpOnly cookie. Closing the table kills it.
8. **Orders:** the server recomputes every price, checks options, sold-out items, opening hours (venue time zone) and the per-session rate limit (counted in PostgreSQL, so no extra service), then writes everything in one transaction. A repeated `client_ref` returns the existing order.
9. **Payments:** a `PaymentProvider` interface with one `CashProvider`, which records cash or the venue's own card terminal. Marking a table paid creates and confirms the payment and closes the session in one transaction.
10. **Languages:** UI strings in `/web/src/i18n/{sq,en}.json` through i18next, with `it` and `de` ready. Menu texts come from the database and fall back to the venue's default language.
11. **Design system:** CSS Modules with CSS variables as tokens. The venue's brand colour is set at runtime, and the text colour on it is picked automatically so any brand colour stays readable. Fonts are self-hosted (Bricolage Grotesque for headings, Inter for body) so the menu works offline and no guest data goes to Google.
12. **Tests:** Vitest everywhere. API tests call the Hono app directly against the real `urdho_test` database.

## Milestones

| # | What gets built | How you check it |
| --- | --- | --- |
| 1 | Repo, tooling, design tokens and base components | `pnpm dev`; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass |
| 2 | Guest app on mock data, all six screens and states, sq and en | Phone-size browser at http://localhost:5173, full order flow on mock data |
| 3 | Staff dashboard on mock data | Tablet-size browser at http://localhost:5173/staff |
| 4 | Docker PostgreSQL, Drizzle migrations, seed | `pnpm db:reset`, browse the data in Drizzle Studio |
| 5 | Login, roles, staff accounts, venue script, tenancy suite | `pnpm test` shows the isolation suite passing |
| 6 | Menu API | API tests pass |
| 7 | Ordering API | Ordering flow test: scan, order, add more, statuses, pay, session token dead |
| 8 | Polling, screens wired to the API, PWA cache | Order from a phone-size tab and watch it arrive on the board |
| 9 | Deploy to Vercel + Neon + Blob | Open the vercel.app URL on a real phone |

## Not in this plan

- Everything the spec lists as not in the MVP.
- Real food photos: the design uses placeholders until the venue (or a photo source you approve) provides them.
