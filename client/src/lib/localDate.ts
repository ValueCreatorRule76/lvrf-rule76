/** §28 D4 (Brad, 24 Nov 2026): the person's own local date, the day they actually act, never the UTC date. */
export const localToday = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
