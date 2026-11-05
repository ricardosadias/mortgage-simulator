import {
  endOfHouseholdDay,
  formatHouseholdMonth,
  householdDayAsPickedDate,
  pickedDay,
  startOfHouseholdMonth,
  startOfHouseholdDay,
  toHouseholdDay,
  withHouseholdDay,
} from '@/utils/householdDay';

// 2026-07-31T23:00:00Z — local midnight on 1 August in Lisbon, which is where a monthly
// rent occurrence lands. Read in UTC it is still July, and that one hour is what used to
// drop the row out of an August filter.
const RENT_INSTANT = 1785538800000;

describe('toHouseholdDay', () => {
  it('reads an instant as the household reckons it, not as UTC does', () => {
    expect(toHouseholdDay(RENT_INSTANT)).toBe('2026-08-01');
  });

  it('puts UTC midnight on the same household day', () => {
    expect(toHouseholdDay(Date.UTC(2026, 7, 1))).toBe('2026-08-01');
  });

  it('reads a winter instant, when the household is on UTC', () => {
    expect(toHouseholdDay(Date.UTC(2026, 0, 15, 12))).toBe('2026-01-15');
  });
});

describe('pickedDay', () => {
  it('takes the calendar fields the picker was clicked on', () => {
    expect(pickedDay(new Date(2026, 7, 1))).toBe('2026-08-01');
  });
});

describe('householdDayAsPickedDate', () => {
  it('carries the calendar fields of the household day, not of the UTC one', () => {
    const date = householdDayAsPickedDate(RENT_INSTANT);

    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 8, 1]);
  });

  it('round-trips through pickedDay, so a filter built from it holds the expense', () => {
    expect(pickedDay(householdDayAsPickedDate(RENT_INSTANT))).toBe(toHouseholdDay(RENT_INSTANT));
  });
});

describe('household day bounds', () => {
  it('starts a summer day at 23:00 UTC the evening before', () => {
    expect(startOfHouseholdDay('2026-08-01')).toBe(RENT_INSTANT);
  });

  it('starts a winter day at UTC midnight', () => {
    expect(startOfHouseholdDay('2026-01-15')).toBe(Date.UTC(2026, 0, 15));
  });

  it('ends a day one millisecond before the next one starts', () => {
    expect(endOfHouseholdDay('2026-08-01')).toBe(startOfHouseholdDay('2026-08-02') - 1);
  });

  it('rolls over the end of a month', () => {
    expect(endOfHouseholdDay('2026-08-31')).toBe(startOfHouseholdDay('2026-09-01') - 1);
  });

  // The clocks go forward at 01:00 on the last Sunday of March, so midnight is unaffected
  // but the day is an hour short.
  it('spans 23 hours on the day the clocks go forward', () => {
    const springForward = '2026-03-29';
    const length = endOfHouseholdDay(springForward) + 1 - startOfHouseholdDay(springForward);

    expect(length).toBe(23 * 60 * 60 * 1000);
  });

  it('spans 25 hours on the day the clocks go back', () => {
    const fallBack = '2026-10-25';
    const length = endOfHouseholdDay(fallBack) + 1 - startOfHouseholdDay(fallBack);

    expect(length).toBe(25 * 60 * 60 * 1000);
  });
});

describe('withHouseholdDay', () => {
  const timeOfDayOn = (instant: number) => instant - startOfHouseholdDay(toHouseholdDay(instant));

  it('moves an instant onto the given day', () => {
    const lunch = Date.UTC(2026, 6, 3, 12, 30);

    expect(toHouseholdDay(withHouseholdDay(lunch, '2026-08-20'))).toBe('2026-08-20');
  });

  it('keeps the time of day the instant was at', () => {
    const lunch = Date.UTC(2026, 6, 3, 12, 30);

    const moved = withHouseholdDay(lunch, '2026-08-20');

    expect(timeOfDayOn(moved)).toBe(timeOfDayOn(lunch));
  });

  // Both days are on summer time, so an hour of the household day is an hour of UTC too.
  it('keeps the time of day across a change of offset', () => {
    const evening = Date.UTC(2026, 7, 20, 21, 15);

    const moved = withHouseholdDay(evening, '2026-01-15');

    expect(timeOfDayOn(moved)).toBe(timeOfDayOn(evening));
  });

  // 29 March is 23 hours long: 23:30 has no counterpart on it, and the copy must still belong
  // to the day the user picked rather than silently rolling into the 30th.
  it('stays on a day the clocks shorten', () => {
    const lateNight = startOfHouseholdDay('2026-08-20') + 23.5 * 60 * 60 * 1000;

    const moved = withHouseholdDay(lateNight, '2026-03-29');

    expect(toHouseholdDay(moved)).toBe('2026-03-29');
    expect(moved).toBe(endOfHouseholdDay('2026-03-29'));
  });
});

describe('formatHouseholdMonth', () => {
  // A month's first instant is household midnight. In summer time that is 23:00 UTC on the
  // last day of the month before, and formatting it in UTC labelled April as March — so a
  // schedule showed March twice and never showed October.
  it('names a summer-time month as itself, not the month before', () => {
    const april2025 = startOfHouseholdMonth(2025 * 12 + 3);

    expect(formatHouseholdMonth(april2025, 'en')).toBe('Apr 25');
  });

  it('names October, the last summer-time month, as itself', () => {
    const october2025 = startOfHouseholdMonth(2025 * 12 + 9);

    expect(formatHouseholdMonth(october2025, 'en')).toBe('Oct 25');
  });

  it('names a winter month as itself', () => {
    const november2025 = startOfHouseholdMonth(2025 * 12 + 10);

    expect(formatHouseholdMonth(november2025, 'en')).toBe('Nov 25');
  });
});

describe('formatHouseholdMonth formatter reuse', () => {
  it('formats a different month shape with its own formatter', () => {
    const april2025 = startOfHouseholdMonth(2025 * 12 + 3);

    expect(formatHouseholdMonth(april2025, 'en')).toBe('Apr 25');
    expect(formatHouseholdMonth(april2025, 'en', { month: 'short', year: 'numeric' })).toBe(
      'Apr 2025'
    );
  });

  it('formats a different locale with its own formatter', () => {
    const april2025 = startOfHouseholdMonth(2025 * 12 + 3);

    expect(formatHouseholdMonth(april2025, 'en')).toBe('Apr 25');
    expect(formatHouseholdMonth(april2025, 'pt-PT')).not.toBe('Apr 25');
  });

  it('gives the same month start however often it is asked', () => {
    expect(startOfHouseholdMonth(2025 * 12 + 3)).toBe(startOfHouseholdMonth(2025 * 12 + 3));
  });
});
