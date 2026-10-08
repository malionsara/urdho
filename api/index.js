// The API on Vercel. `pnpm build` writes server/dist/vercel.js from server/vercel.ts; vercel.json
// sends every /api/* request here.
export { default } from '../server/dist/vercel.js';
