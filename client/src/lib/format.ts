/**
 * UX-1 slice 3 — numbers and amounts for people, from the STORED unit, never
 * an assumed one (Brad, 19 Oct 2026). The stored value stays exact on the
 * record; only how it is shown changes.
 *
 *   unit is an ISO 4217 currency code (USD, EUR, GBP…) -> that currency:
 *     3413100000 USD -> "$3,413.1 million"; 950 EUR -> "€950"
 *   any other unit -> the number with its unit: 5200 people -> "5,200 people"
 *   no unit -> the number alone: 1.4 -> "1.4"
 * A unit that looks like a code but no currency matches it is shown as typed
 * after the number, never guessed into a symbol.
 */
const MILLION = 1_000_000;

function currencySymbol(code: string): string | null {
  try {
    const part = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency');
    return part ? part.value : null;
  } catch { return null; }
}

export function formatQuantity(raw: string | number | null, unit: string | null): string {
  if (raw === null || raw === '') return 'Not recorded.';
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${raw}${unit ? ` ${unit}` : ''}`;
  const u = unit?.trim() ?? '';
  const grouped = (x: number, max = 2) => x.toLocaleString('en-US', { maximumFractionDigits: max });
  if (/^[A-Z]{3}$/.test(u)) {
    const sym = currencySymbol(u);
    if (sym && sym !== u) {
      return Math.abs(n) >= MILLION ? `${sym}${grouped(n / MILLION, 1)} million` : `${sym}${grouped(n)}`;
    }
    return Math.abs(n) >= MILLION ? `${grouped(n / MILLION, 1)} million ${u}` : `${grouped(n)} ${u}`;
  }
  return u ? `${grouped(n)} ${u}` : grouped(n);
}
