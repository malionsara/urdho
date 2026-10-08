// Locally, settings come from .env (see .env.example); on Vercel they are real environment variables.
try {
  process.loadEnvFile();
} catch {
  // No .env file: use the environment as it is.
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env, or set it in the environment.`);
  return value;
}

/** True for databases on this machine, the only ones the reset and test scripts may wipe. */
export function isLocalDatabase(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
