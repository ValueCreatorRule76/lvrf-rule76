/** B3 (UX item 1): one number format for the whole value case: en-US grouping, up to two decimals, no trailing zeros. */
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : NUM.format(Number(v)));
/** A currency figure always names its currency; with none sealed it says so rather than guessing one. */
export const money = (v: number | string | null | undefined, currency: string | null) => {
  const n = num(v);
  if (n === null) return null;
  return currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(v)) : `${n} (currency not recorded)`;
};
