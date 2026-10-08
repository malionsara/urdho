Read docs/SPEC.md and CLAUDE.md. First, write a short implementation plan for the Urdho MVP and wait for my approval. Then build in these milestones, stopping after each so I can run and review it:

1. Repo setup and design system: one TypeScript repo with /web (React + Vite), /server, /api and /shared, linting, tests, a README with run instructions, and the design tokens and base components.
2. Guest app design on mock data: menu, item page, basket with add-on carousel, checkout with pay-at-the-end, order status with call the waiter, plus loading, sold-out and empty-basket states, in Albanian and English. Match the Claude Design artboards when I provide them.
3. Staff dashboard design on mock data: live orders board with sound alerts and the "New table" flag, waiter calls, tables with running bill, menu manager, staff accounts, venue settings, QR code generator and printable table cards.
4. Database: Docker Compose PostgreSQL (dev and test databases), Drizzle migrations for the data model in the spec, a seed script with one demo venue, 6 tables, 3 categories and 12 Albanian menu items with sq and en texts.
5. Auth and tenancy: staff login with roles, owner-managed staff accounts, a script that creates a venue and its owner, venue scoping on every request, and tenancy isolation tests.
6. Menu API: CRUD for categories, items, option groups and translations, sold-out toggle, basket suggestions, image upload.
7. Ordering API: scan token to table session, create orders with server-side pricing and a retry key, add to an open session, status changes and cancel, waiter calls, mark session paid with the cash provider, opening hours, rate limits, and ordering flow tests.
8. Live updates and wiring: polling endpoints, connect the guest app and dashboard to the real API, PWA menu cache.
9. Deploy: Vercel project with Neon and Vercel Blob, a preview deploy per branch.

After each milestone, tell me what you built, how to run it, and what you did not do.
