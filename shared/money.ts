// Formatted by hand rather than with Intl: some browsers ship without Albanian number data and
// fall back to English "2,300", which an Albanian reader takes as 2.3 (the comma is the decimal mark).
const NBSP = String.fromCharCode(0xa0);
const MINUS = String.fromCharCode(0x2212);

/** Formats whole lekë the Albanian way: "850 L", "1200 L", "12 500 L" (groups start at five digits). */
export function formatLek(amount: number): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded));
  const grouped = digits.length >= 5 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : digits;
  return `${rounded < 0 ? MINUS : ''}${grouped}${NBSP}L`;
}

/** Formats a price change on an option: "+150 L". Zero returns an empty string. */
export function formatLekDelta(amount: number): string {
  if (amount === 0) return '';
  return `${amount > 0 ? '+' : MINUS}${formatLek(Math.abs(amount))}`;
}
