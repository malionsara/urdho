/*
 * Design-review switches, read from the URL once and kept for the browser tab:
 *   ?brand=1F5E45   preview the guest app in another brand colour (?brand=reset to clear)
 *   ?slow=1         slow the mock API down to see loading states (?slow=0 to clear)
 */

function readFlag(name: string, clear: string): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value === clear) sessionStorage.removeItem(`urdho-${name}`);
    else if (value) sessionStorage.setItem(`urdho-${name}`, value);
    return sessionStorage.getItem(`urdho-${name}`);
  } catch {
    return null;
  }
}

export function brandOverride(): string | null {
  const value = readFlag('brand', 'reset');
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : null;
}

export function slowMock(): boolean {
  return readFlag('slow', '0') === '1';
}
