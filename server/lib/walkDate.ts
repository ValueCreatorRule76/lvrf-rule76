// §31 (Brad, 24 Nov 2026, D1): a walk date's UTC calendar date may be no later than today's UTC date plus one day. One
// day's margin admits every person's local today on Earth (Auckland at 09:00 on 25 Nov is 20:00 UTC on 24 Nov), and
// nothing later. The database holds the same rule for every caller (lvrf_block_simulated_attestor).
const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** True when `when` falls on a UTC date later than today's UTC date plus one day. */
export function laterThanToday(when: Date, now: Date = new Date()): boolean {
  return utcDay(when) > utcDay(now) + DAY_MS;
}

export const NOT_FUTURE = {
  commit: "The commit date can't be later than today.",
  measure: "The measurement date can't be later than today.",
  verify: "The verification date can't be later than today.",
} as const;
