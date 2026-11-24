/**
 * §28 D5 (Brad, 24 Nov 2026): "late" is Anywhere on Earth. An outcome is late only once its promised day has ended
 * everywhere: from 12:00 UTC on the day after the promised date (the day ends last at UTC-12). This replaces §26 D4's
 * UTC-date comparison. Never late once an actual is measured, and never late with no promised date.
 *
 * One definition: GET /api/book reads it, and verify_local_date proves it at fixed instants.
 */
export const DAY_MS = 86_400_000;

/** The instant the promised day (YYYY-MM-DD) has ended everywhere. */
export function promisedDayEndsEverywhere(promisedOn: string): number {
  return Date.parse(`${promisedOn}T12:00:00Z`) + DAY_MS;
}

export function isLate(promisedOn: string | null, measuredOn: string | null, now: Date = new Date()): boolean {
  if (promisedOn === null || measuredOn !== null) return false;
  return now.getTime() >= promisedDayEndsEverywhere(promisedOn);
}
