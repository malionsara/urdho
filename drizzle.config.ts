import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // No .env file: use the environment as it is.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://urdho:urdho@localhost:5433/urdho' },
  strict: true,
  verbose: true,
});
