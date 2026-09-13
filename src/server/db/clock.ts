/** A clock is injectable so week boundaries can be tested without fake timers. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

/** Returns the Monday 00:00:00.000 UTC containing `date`. */
export function startOfWeekUtc(date: Date): Date {
  const utcDay = date.getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysSinceMonday,
    ),
  );
}

export function weekStartUtcIso(date: Date): string {
  return startOfWeekUtc(date).toISOString();
}
