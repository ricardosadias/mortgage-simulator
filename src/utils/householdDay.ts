// An expense records a calendar day — "the 1st of August" — but stores it as an instant.
// Rebuilding that day's bounds in the *viewer's* timezone made one row land on two different
// days on two devices: a rent occurrence written at local midnight in Lisbon is 23:00 UTC on
// the 31st, so a machine running UTC put it in July and dropped it from an August filter.
// Every question about which day an expense belongs to is answered here, in the household's
// zone, so the answer no longer depends on where the device thinks it is.
const HOUSEHOLD_TIME_ZONE = 'Europe/Lisbon';

/** A calendar day in the household's timezone, as `YYYY-MM-DD`. Ordering the strings
 *  lexicographically orders the days chronologically, which is what makes them comparable. */
export type HouseholdDay = string;

const dayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOUSEHOLD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const instantParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOUSEHOLD_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const pad = (value: number): string => `${value}`.padStart(2, '0');

const asDay = (year: number, month: number, date: number): HouseholdDay =>
  `${year}-${pad(month)}-${pad(date)}`;

/** The calendar fields of a household day. Read by position rather than by splitting, so
 *  every field is a number to the type checker without an assertion or a stand-in default. */
export const householdDayParts = (
  day: HouseholdDay
): { year: number; month: number; date: number } => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)),
  date: Number(day.slice(8, 10)),
});

/** How far the household's zone is from UTC at a given instant, in milliseconds. */
const zoneOffsetAt = (instant: number): number => {
  const parts = instantParts.formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return (
    Date.UTC(
      field('year'),
      field('month') - 1,
      field('day'),
      field('hour'),
      field('minute'),
      field('second')
    ) - instant
  );
};

// Two passes because the offset has to be sampled at the instant it is applied to: sampling
// it only at the UTC guess is wrong on the days a zone changes offset.
const householdMidnight = (day: HouseholdDay): number => {
  const { year, month, date } = householdDayParts(day);
  const guess = Date.UTC(year, month - 1, date, 0, 0, 0, 0);
  return guess - zoneOffsetAt(guess - zoneOffsetAt(guess));
};

const nextDay = (day: HouseholdDay): HouseholdDay => {
  const { year, month, date } = householdDayParts(day);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return asDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
};

/** The household day an instant falls on. */
export const toHouseholdDay = (instant: number): HouseholdDay => dayParts.format(instant);

/** The household day a picked calendar date stands for. Date pickers hand back a Date whose
 *  *local* fields are what the user clicked, so those fields are read directly — converting
 *  it to an instant first would re-introduce the timezone shift this module exists to remove. */
export const pickedDay = (date: Date): HouseholdDay =>
  asDay(date.getFullYear(), date.getMonth() + 1, date.getDate());

/** The first instant of a household day. */
export const startOfHouseholdDay = (day: HouseholdDay): number => householdMidnight(day);

/** The last instant of a household day. */
export const endOfHouseholdDay = (day: HouseholdDay): number => householdMidnight(nextDay(day)) - 1;

/** An instant kept at its time of day, moved onto `day`. Clamped to the end of the target day:
 *  a household day is 23 hours long when the clocks go forward, so a late-evening time of day
 *  would otherwise land on the day after the one that was asked for. */
export const withHouseholdDay = (instant: number, day: HouseholdDay): number => {
  const timeOfDay = instant - startOfHouseholdDay(toHouseholdDay(instant));
  return Math.min(startOfHouseholdDay(day) + timeOfDay, endOfHouseholdDay(day));
};

/** Today, as the household reckons it. */
export const householdToday = (): HouseholdDay => toHouseholdDay(Date.now());

/** The household day an instant falls on, as a Date whose *local* calendar fields are that
 *  day — the inverse of `pickedDay`, so a value read off an expense can be handed straight to
 *  the date filter without the zone shift a raw instant would carry. */
export const householdDayAsPickedDate = (instant: number): Date => {
  const { year, month, date } = householdDayParts(toHouseholdDay(instant));
  return new Date(year, month - 1, date);
};

/** An instant written as the day it belongs to, e.g. `Sat Aug 01 2026`. Built from the day's
 *  calendar fields so the label matches the day the row is filtered under — rendering the
 *  raw instant showed the row under the previous day on a device behind the household. */
export const formatHouseholdDay = (instant: number): string =>
  householdDayAsPickedDate(instant).toDateString();

/**
 * The month an instant falls in, counted in months so that two of them can be compared and
 * subtracted. A loan schedule needs exactly that — "is this instalment in the past", "how
 * many months between these two" — and answering it by month rather than by instant is what
 * keeps a device behind the household from reading the schedule a month early.
 */
export const toHouseholdMonthIndex = (instant: number): number => {
  const { year, month } = householdDayParts(toHouseholdDay(instant));
  return year * 12 + (month - 1);
};

/** The current month, on the same scale as `toHouseholdMonthIndex`. */
export const householdThisMonthIndex = (): number => {
  const { year, month } = householdDayParts(householdToday());
  return year * 12 + (month - 1);
};

/** The first instant of a month index, for labelling a month the household's way. */
// Resolving a month's first instant takes two Intl.formatToParts calls (the zone offset is
// sampled twice to survive clock changes); a schedule asks for the same few hundred months on
// every build. The answer never changes for a given month, so it is computed once.
const monthStarts = new Map<number, number>();

export const startOfHouseholdMonth = (monthIndex: number): number => {
  let start = monthStarts.get(monthIndex);
  if (start === undefined) {
    start = startOfHouseholdDay(asDay(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 1));
    monthStarts.set(monthIndex, start);
  }
  return start;
};

const monthFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A month label such as "Apr 25", read in the household's zone. A month's first instant is
 * household midnight, which in summer time is 23:00 UTC on the last day of the previous month
 * — so formatting it in UTC, or in a zone behind the household, names the wrong month.
 */
export const formatHouseholdMonth = (
  instant: number,
  locale: string,
  options: Pick<Intl.DateTimeFormatOptions, 'month' | 'year'> = { month: 'short', year: '2-digit' }
): string => {
  // toLocaleDateString builds a fresh formatter on every call, and a schedule labels hundreds
  // of months per render; one formatter per locale and shape is reused instead.
  const key = `${locale}|${options.month ?? ''}|${options.year ?? ''}`;
  let formatter = monthFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: HOUSEHOLD_TIME_ZONE });
    monthFormatters.set(key, formatter);
  }
  return formatter.format(instant);
};

/**
 * The month a picked calendar day belongs to. Mantine's pickers hand back `YYYY-MM-DD`, and
 * reading the month straight from that string is the only zone-free route: `new Date()` parses
 * it as UTC midnight, which is the previous month on any device west of UTC.
 */
export const monthIndexOfDay = (day: HouseholdDay): number => {
  const { year, month } = householdDayParts(day);
  return year * 12 + (month - 1);
};
