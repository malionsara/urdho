import { defineConfig } from 'vite';

/**
 * Bundles the API into one file for Vercel: server/vercel.ts → server/dist/vercel.js. Packages stay
 * in node_modules, where Vercel finds them. The bundle lives outside dist/, which is public.
 */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/vercel.ts',
    outDir: 'server/dist',
    emptyOutDir: true,
    target: 'node24',
    sourcemap: true,
    rolldownOptions: { output: { entryFileNames: 'vercel.js' } },
  },
});
