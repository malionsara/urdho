import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test gets a fresh copy of the module, as a fresh page load would.
const load = async () => {
  vi.resetModules();
  return import('./updates');
};

let store: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new Map();
  reload = vi.fn();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('navigator', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a file missing after a deploy', () => {
  it('is recognised in the words of each browser and of Vite', async () => {
    const { isMissingFileError } = await load();
    for (const message of [
      'Failed to fetch dynamically imported module: https://urdho.al/assets/StaffApp-x.js',
      'Importing a module script failed.',
      'error loading dynamically imported module',
      'Unable to preload CSS for https://urdho.al/assets/StaffApp-x.css',
    ]) {
      expect(isMissingFileError(new Error(message))).toBe(true);
    }
    expect(isMissingFileError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('reloads into the new version, once', async () => {
    const { reloadForNewVersion } = await load();
    expect(reloadForNewVersion()).toBe(true);
    expect(reloadForNewVersion()).toBe(true); // the same page asking again changes nothing
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does not reload again within a minute, so a real outage shows the error instead of looping', async () => {
    (await load()).reloadForNewVersion();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const afterReload = await load();
    expect(afterReload.reloadForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves it to the reload button when the browser blocks storage', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    const { reloadForNewVersion } = await load();
    expect(reloadForNewVersion()).toBe(false);
  });
});
