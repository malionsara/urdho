import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['{web,shared}/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        // Needs PostgreSQL from docker-compose.yml: `pnpm db:up`.
        extends: true,
        test: {
          name: 'db',
          include: ['server/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['server/test/global-setup.ts'],
          // Files share one test database, so they take turns.
          fileParallelism: false,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
