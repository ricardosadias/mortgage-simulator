import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  aggregateByYear,
  analyseLoan,
  loanTermsAt,
  buildSchedule,
  compareScenario,
  summarize,
  usualPrepaymentFeePercent,
  type PrepaymentEffect,
  type Scenario,
} from '@/utils/mortgage';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';
import { toHouseholdMonthIndex } from '@/utils/householdDay';

// Mid-month so no value sits on a timezone boundary: the engine reasons in household months,
// and a 1st-of-the-month instant written in UTC belongs to the previous month in Lisbon.
const midMonth = (year: number, month: number) => Date.UTC(year, month - 1, 15);

/**
 * The user's actual loan, transcribed from the spreadsheet it replaces: 180 000 € over 240
 * months from April 2025, spread 0.70%, four euribor resets and four prepayments.
 *
 * The euribor figures are derived from the sheet's interest column rather than from its
 * 2-decimal TAN display, which is too coarse to reproduce the instalments: interest is
 * exactly `balance × TAN / 12` in every row, which pins the TAN to 3.3140 / 2.7550 / 2.8390
 * / 3.3470 and so the euribor to these values against a 0.70 spread.
 *
 * Known limitation, deliberately not papered over: the opening instalment and both
 * prepayment recomputes match the sheet to the cent, and interest matches in every row — but
 * the instalment the sheet shows at a *rate reset* does not match the formula (#6 by 0.17 €,
 * #11 by 0.03 €, #18 by 1.33 €), and no remaining-term or rounding convention reproduces it.
 * Those values appear to be typed in from the bank, whose day-count convention is unknown.
 * So resets are asserted as relationships (the rate changes, the instalment is recomputed and
 * then held) rather than pinned to figures this engine cannot derive.
 */
const realLoan = (overrides: Partial<Mortgage> = {}): Mortgage => ({
  id: 'loan-1',
  name: 'Crédito habitação',
  initialAmount: 180000,
  firstPaymentDate: midMonth(2025, 4),
  termMonths: 240,
  ratePeriods: [
    { kind: 'variable', startDate: midMonth(2025, 4), euribor: 2.614, spread: 0.7 },
    { kind: 'variable', startDate: midMonth(2025, 9), euribor: 2.055, spread: 0.7 },
    { kind: 'variable', startDate: midMonth(2026, 2), euribor: 2.139, spread: 0.7 },
    { kind: 'variable', startDate: midMonth(2026, 9), euribor: 2.647, spread: 0.7 },
  ],
  prepayments: [
    { id: 'p1', date: midMonth(2025, 5), amount: 4000, feePercent: 0 },
    { id: 'p2', date: midMonth(2025, 7), amount: 4000, feePercent: 0 },
    { id: 'p3', date: midMonth(2025, 11), amount: 1000, feePercent: 0 },
    { id: 'p4', date: midMonth(2025, 12), amount: 4000, feePercent: 0 },
  ],
  initialCosts: [
    { id: 'c1', name: 'IMT', amount: 14906.5 },
    { id: 'c2', name: 'Imposto selo', amount: 2840 },
    { id: 'c3', name: 'ISUC', amount: 1080 },
    { id: 'c4', name: 'Comissão de avaliação', amount: 239.2 },
    { id: 'c5', name: 'Emolumento base compra venda', amount: 475.62 },
    { id: 'c6', name: 'Emolumento financiamento', amount: 475.62 },
    { id: 'c7', name: 'Cheque', amount: 26 },
    { id: 'c8', name: 'Certidão online registo predial', amount: 20 },
  ],
  cashbackCampaigns: [],
  monthlyCosts: [],
  offers: [],
  createdAt: midMonth(2025, 4),
  lastUpdated: midMonth(2025, 4),
  ...overrides,
});

const paymentNumber = (schedule: ReturnType<typeof buildSchedule>, number: number) => {
  const payment = schedule.find((entry) => entry.number === number);
  if (!payment) {
    throw new Error(`no payment #${number} in the schedule`);
  }
  return payment;
};

/** 180 000 € over 240 months at a fixed 3.20%, with nothing else on it. */
const fixedLoan = (overrides: Partial<Mortgage> = {}): Mortgage =>
  realLoan({
    ratePeriods: [{ kind: 'fixed', startDate: midMonth(2025, 4), tan: 3.2 }],
    prepayments: [],
    ...overrides,
  });

/** Fixed at 3.20% for two years, then euribor 2.647% + 0.70% from April 2027. */
const mixedLoan = (overrides: Partial<Mortgage> = {}): Mortgage =>
  realLoan({
    ratePeriods: [
      { kind: 'fixed', startDate: midMonth(2025, 4), tan: 3.2 },
      { kind: 'variable', startDate: midMonth(2027, 4), euribor: 2.647, spread: 0.7 },
    ],
    prepayments: [],
    ...overrides,
  });

const singleRateLoan = (overrides: Partial<Mortgage> = {}): Mortgage =>
  realLoan({
    ratePeriods: [{ kind: 'variable', startDate: midMonth(2025, 4), euribor: 2.3, spread: 0.7 }],
    prepayments: [],
    initialCosts: [],
    ...overrides,
  });

describe('buildSchedule — against the real loan', () => {
  it('runs for the full term', () => {
    expect(buildSchedule(realLoan())).toHaveLength(240);
  });

  // The opening instalment is the single strongest check on the formula: French
  // amortization over 240 months at 3.314% must give the bank's own 1026.81 €.
  it('matches the opening instalment and its interest split to the cent', () => {
    const first = paymentNumber(buildSchedule(realLoan()), 1);

    expect(first.payment).toBeCloseTo(1026.81, 2);
    expect(first.interest).toBeCloseTo(497.1, 2);
    expect(first.principal).toBeCloseTo(529.71, 2);
    expect(first.balance).toBeCloseTo(179470.29, 2);
  });

  it('charges interest on the outstanding balance at the rate in force', () => {
    const schedule = buildSchedule(realLoan());

    // One row from each rate period, all exact in the sheet.
    expect(paymentNumber(schedule, 2).interest).toBeCloseTo(495.64, 2);
    expect(paymentNumber(schedule, 5).interest).toBeCloseTo(469.2, 2);
    expect(paymentNumber(schedule, 6).interest).toBeCloseTo(388.88, 2);
    expect(paymentNumber(schedule, 11).interest).toBeCloseTo(382.48, 2);
  });

  it('applies a prepayment in its own month, on top of the instalment', () => {
    const second = paymentNumber(buildSchedule(realLoan()), 2);

    expect(second.prepayment).toBe(4000);
    // 179 470.29 − 531.17 of capital − 4 000 prepaid.
    expect(second.balance).toBeCloseTo(174939.13, 2);
  });

  it('lowers the instalment after a prepayment and keeps the term', () => {
    const schedule = buildSchedule(realLoan());

    // Recomputed over the 238 months left, at the unchanged 3.314%.
    expect(paymentNumber(schedule, 3).payment).toBeCloseTo(1003.85, 2);
    expect(paymentNumber(schedule, 5).payment).toBeCloseTo(980.76, 2);
    expect(schedule).toHaveLength(240);
  });

  it('carries the instalment unchanged between resets and prepayments', () => {
    const schedule = buildSchedule(realLoan());

    expect(paymentNumber(schedule, 4).payment).toBeCloseTo(paymentNumber(schedule, 3).payment, 10);
  });

  it('recomputes the instalment when the rate resets', () => {
    const schedule = buildSchedule(realLoan());

    // The reset at #6 drops the TAN from 3.314% to 2.755%, so the instalment must fall.
    // Asserted as a relationship, not against the sheet's 933.26 € — see the note below.
    expect(paymentNumber(schedule, 6).annualRate).toBeCloseTo(2.755, 10);
    expect(paymentNumber(schedule, 6).payment).toBeLessThan(paymentNumber(schedule, 5).payment);
    expect(paymentNumber(schedule, 7).payment).toBeCloseTo(paymentNumber(schedule, 6).payment, 10);
  });

  it('clears the loan by the final instalment', () => {
    const schedule = buildSchedule(realLoan());

    expect(schedule.at(-1)?.balance).toBe(0);
  });
});

describe('buildSchedule — edge cases', () => {
  it('ends the loan early when a prepayment clears the balance', () => {
    const schedule = buildSchedule(
      singleRateLoan({
        prepayments: [{ id: 'p1', date: midMonth(2025, 6), amount: 500000, feePercent: 0 }],
      })
    );

    expect(schedule).toHaveLength(3);
    expect(schedule.at(-1)?.balance).toBe(0);
  });

  it('caps a prepayment at the balance rather than overshooting into credit', () => {
    const schedule = buildSchedule(
      singleRateLoan({
        prepayments: [{ id: 'p1', date: midMonth(2025, 6), amount: 500000, feePercent: 0 }],
      })
    );
    const clearing = paymentNumber(schedule, 3);

    expect(clearing.prepayment).toBeLessThan(500000);
    expect(clearing.balance).toBe(0);
  });

  it('extends the earliest rate backwards when it starts after the first instalment', () => {
    const schedule = buildSchedule(
      singleRateLoan({
        ratePeriods: [
          { kind: 'variable', startDate: midMonth(2030, 1), euribor: 2.3, spread: 0.7 },
        ],
      })
    );

    expect(paymentNumber(schedule, 1).annualRate).toBeCloseTo(3, 10);
  });

  it('splits an interest-free loan evenly instead of dividing by zero', () => {
    const schedule = buildSchedule(
      singleRateLoan({
        initialAmount: 2400,
        termMonths: 24,
        ratePeriods: [{ kind: 'variable', startDate: midMonth(2025, 4), euribor: 0, spread: 0 }],
      })
    );

    expect(paymentNumber(schedule, 1).payment).toBeCloseTo(100, 10);
    expect(paymentNumber(schedule, 1).interest).toBe(0);
    expect(schedule.at(-1)?.balance).toBe(0);
  });

  it('has no schedule for a loan with no capital', () => {
    expect(buildSchedule(singleRateLoan({ initialAmount: 0 }))).toEqual([]);
  });

  it('has no schedule for a loan with no term', () => {
    expect(buildSchedule(singleRateLoan({ termMonths: 0 }))).toEqual([]);
  });
});

describe('summarize', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const atMonth = (year: number, month: number) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(year, month - 1, 15, 12)));
  };

  it('counts an instalment falling in the current month as made', () => {
    atMonth(2025, 4);

    expect(summarize(realLoan()).paymentsMade).toBe(1);
  });

  it('splits the term into instalments made and still to come', () => {
    atMonth(2026, 11);

    const summary = summarize(realLoan());

    expect(summary.paymentsMade).toBe(20);
    expect(summary.paymentsRemaining).toBe(220);
  });

  it('reports the balance left after the most recent instalment', () => {
    atMonth(2025, 4);

    expect(summarize(realLoan()).balance).toBeCloseTo(179470.29, 2);
  });

  it('reports the full capital as owed before the first instalment', () => {
    atMonth(2025, 1);

    const summary = summarize(realLoan());

    expect(summary.paymentsMade).toBe(0);
    expect(summary.balance).toBe(180000);
  });

  it('totals what has been paid, separating capital, interest and prepayments', () => {
    atMonth(2025, 5);

    const summary = summarize(realLoan());

    // The sheet's own figures for the first two instalments, which are sums of rows it has
    // already rounded to cents — hence a cent of tolerance rather than an exact match. The
    // engine keeps full precision deliberately, so its total is the more accurate of the two.
    expect(summary.principalPaid).toBeCloseTo(1060.88, 1);
    expect(summary.interestPaid).toBeCloseTo(992.74, 1);
    expect(summary.prepaidTotal).toBe(4000);
    expect(summary.totalPaid).toBeCloseTo(
      summary.principalPaid + summary.interestPaid + summary.prepaidTotal,
      10
    );
  });

  it('accounts for every euro of capital: what is repaid plus what is owed', () => {
    atMonth(2026, 11);

    const summary = summarize(realLoan());

    // Exact, not cent-tolerant: capital does not leak. An error in how principal or
    // prepayments accumulate breaks this identity by euros.
    expect(summary.principalPaid + summary.prepaidTotal + summary.balance).toBeCloseTo(180000, 8);
  });

  it('quotes the next instalment due, not the one already paid', () => {
    atMonth(2025, 4);

    const summary = summarize(realLoan());

    expect(summary.currentPayment).toBeCloseTo(1026.81, 2);
    expect(summary.currentRate).toBeCloseTo(3.314, 10);
  });

  it('adds the up-front costs to the projected cost of borrowing', () => {
    atMonth(2026, 11);

    const summary = summarize(realLoan());

    expect(summary.initialCostsTotal).toBeCloseTo(20062.94, 2);
    expect(summary.projectedTotalCost).toBeCloseTo(summary.projectedTotalInterest + 20062.94, 2);
  });

  it('projects a payoff date at the end of the term', () => {
    atMonth(2026, 11);

    const payoff = summarize(realLoan()).payoffDate;

    // 240 instalments from April 2025 ends in March 2045.
    expect(payoff).toBeDefined();
    expect(toHouseholdMonthIndex(payoff ?? 0)).toBe(2045 * 12 + 2);
  });

  it('falls back to the final instalment once the loan is paid off', () => {
    atMonth(2050, 1);

    const summary = summarize(realLoan());

    expect(summary.paymentsRemaining).toBe(0);
    expect(summary.balance).toBe(0);
  });
});

describe('aggregateByYear', () => {
  it('groups by loan year rather than calendar year', () => {
    const years = aggregateByYear(buildSchedule(realLoan()));

    expect(years).toHaveLength(20);
    expect(years.at(0)?.year).toBe(1);
  });

  it('totals exactly the instalments it covers', () => {
    const schedule = buildSchedule(realLoan());
    const [firstYear] = aggregateByYear(schedule);
    const firstTwelve = schedule.slice(0, 12);

    // Not pinned to the sheet's own 6 391.20 €: that figure embeds the instalment the bank
    // set at the rate reset on #6, which this engine computes from the formula instead and
    // which differs by cents. See the note at the top of the file.
    expect(firstYear?.principal).toBeCloseTo(
      firstTwelve.reduce((total, payment) => total + payment.principal, 0),
      8
    );
    expect(firstYear?.interest).toBeCloseTo(
      firstTwelve.reduce((total, payment) => total + payment.interest, 0),
      8
    );
  });

  it('carries the prepayments into the year they fall in', () => {
    const [firstYear, secondYear] = aggregateByYear(buildSchedule(realLoan()));

    // All four prepayments land in instalments 2-9, so all of them are in loan year 1.
    expect(firstYear?.prepayment).toBe(13000);
    expect(secondYear?.prepayment).toBe(0);
  });

  it('has nothing to group for a loan with no schedule', () => {
    expect(aggregateByYear([])).toEqual([]);
  });
});

describe('spread cashback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const campaign = (id: string, start: [number, number], end: [number, number]) => ({
    id,
    startDate: midMonth(...start),
    endDate: midMonth(...end),
  });

  // The real loan's offer: instalments 1-24, April 2025 to March 2027.
  const withCampaign = (overrides: Partial<Mortgage> = {}) =>
    realLoan({ cashbackCampaigns: [campaign('c1', [2025, 4], [2027, 3])], ...overrides });

  it('returns the spread share of the first instalment interest', () => {
    const first = paymentNumber(buildSchedule(withCampaign()), 1);

    // 180 000 € × 0.70% / 12 — the sheet's first Campanha row.
    expect(first.cashback).toBeCloseTo(105, 2);
  });

  // The sheet's Campanha column uses the balance *after* each instalment from row 2 on
  // (102.05 € here). The bank computes it on the balance before the instalment — the base the
  // interest is charged on — so this is the sheet's previous-row figure.
  it('bases each cashback on the balance before the instalment', () => {
    const schedule = buildSchedule(withCampaign());

    expect(paymentNumber(schedule, 2).cashback).toBeCloseTo(104.69, 2);
    expect(paymentNumber(schedule, 3).cashback).toBeCloseTo(102.05, 2);
  });

  it('is exactly the spread part of the interest charged', () => {
    const third = paymentNumber(buildSchedule(withCampaign()), 3);

    expect(third.cashback).toBeCloseTo(third.interest * (0.7 / third.annualRate), 10);
  });

  it('runs through its end month, inclusive, and stops', () => {
    const schedule = buildSchedule(withCampaign());

    expect(paymentNumber(schedule, 24).cashback).toBeGreaterThan(0);
    expect(paymentNumber(schedule, 25).cashback).toBe(0);
  });

  it('leaves the instalment, interest and balance exactly as without a campaign', () => {
    const strip = ({ cashback: _cashback, ...rest }: ReturnType<typeof buildSchedule>[number]) =>
      rest;

    expect(buildSchedule(withCampaign()).map(strip)).toEqual(buildSchedule(realLoan()).map(strip));
  });

  it('is zero throughout for a loan without a campaign', () => {
    expect(buildSchedule(realLoan()).every((payment) => payment.cashback === 0)).toBe(true);
  });

  it('follows the spread in force when it changes', () => {
    const schedule = buildSchedule(
      singleRateLoan({
        cashbackCampaigns: [campaign('c1', [2025, 4], [2027, 3])],
        ratePeriods: [
          { kind: 'variable', startDate: midMonth(2025, 4), euribor: 2.3, spread: 0.7 },
          { kind: 'variable', startDate: midMonth(2025, 6), euribor: 2.3, spread: 0.5 },
        ],
      })
    );
    const third = paymentNumber(schedule, 3);
    const balanceBeforeThird = paymentNumber(schedule, 2).balance;

    expect(third.cashback).toBeCloseTo((balanceBeforeThird * 0.5) / 100 / 12, 10);
  });

  it('counts as received only the cashback of instalments already made', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2025, 4, 15, 12)));

    expect(summarize(withCampaign()).cashbackReceived).toBeCloseTo(105 + 104.69, 1);
  });

  it('quotes the next instalment net of its cashback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2025, 3, 15, 12)));

    const summary = summarize(withCampaign());

    expect(summary.currentNetPayment).toBeCloseTo(
      summary.currentPayment - summary.currentCashback,
      10
    );
    expect(summary.currentCashback).toBeGreaterThan(0);
  });

  it('takes the projected cashback off the total cost of borrowing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 12)));

    const summary = summarize(withCampaign());

    expect(summary.projectedTotalCost).toBeCloseTo(
      summary.projectedTotalInterest + summary.initialCostsTotal - summary.projectedCashback,
      8
    );
  });

  it('starts in its start month, not before', () => {
    const schedule = buildSchedule(
      realLoan({ cashbackCampaigns: [campaign('c1', [2025, 6], [2025, 8])] })
    );

    expect(paymentNumber(schedule, 2).cashback).toBe(0);
    expect(paymentNumber(schedule, 3).cashback).toBeGreaterThan(0);
    expect(paymentNumber(schedule, 5).cashback).toBeGreaterThan(0);
    expect(paymentNumber(schedule, 6).cashback).toBe(0);
  });

  it('pays nothing in a gap between two campaigns', () => {
    const schedule = buildSchedule(
      realLoan({
        cashbackCampaigns: [
          campaign('c1', [2025, 4], [2025, 6]),
          campaign('c2', [2025, 9], [2025, 12]),
        ],
      })
    );

    expect(paymentNumber(schedule, 3).cashback).toBeGreaterThan(0);
    expect(paymentNumber(schedule, 4).cashback).toBe(0);
    expect(paymentNumber(schedule, 5).cashback).toBe(0);
    expect(paymentNumber(schedule, 6).cashback).toBeGreaterThan(0);
  });

  // A renegotiation can renew the offer before the running one ends. The months both cover
  // are paid once — a renewal replaces the offer, it does not stack on it.
  it('pays an overlapped month once when an offer is renewed early', () => {
    const renewed = buildSchedule(
      realLoan({
        cashbackCampaigns: [
          campaign('c1', [2025, 4], [2027, 3]),
          campaign('c2', [2026, 6], [2028, 5]),
        ],
      })
    );
    const single = buildSchedule(withCampaign());

    expect(paymentNumber(renewed, 20).cashback).toBeCloseTo(paymentNumber(single, 20).cashback, 10);
    expect(paymentNumber(renewed, 30).cashback).toBeGreaterThan(0);
    expect(paymentNumber(renewed, 39).cashback).toBe(0);
  });

  it('ends the campaign with the 24th instalment', () => {
    const end = summarize(withCampaign()).cashbackEndDate;

    // Instalment 24 of a loan starting April 2025 falls in March 2027.
    expect(toHouseholdMonthIndex(end ?? 0)).toBe(2027 * 12 + 2);
  });

  it('has no cashback figures for a loan without a campaign', () => {
    const summary = summarize(realLoan());

    expect(summary.projectedCashback).toBe(0);
    expect(summary.cashbackEndDate).toBeUndefined();
  });
});

describe('monthly extra costs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const atApril2025 = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2025, 3, 15, 12)));
  };

  const costs = [
    {
      id: 'm1',
      name: 'Account fee',
      amount: 5.5,
      isIncludedInMonthlyTotal: true,
      isSubjectToStampDuty: false,
    },
    {
      id: 'm2',
      name: 'Life insurance',
      amount: 30,
      isIncludedInMonthlyTotal: true,
      isSubjectToStampDuty: false,
    },
    {
      id: 'm3',
      name: 'Home insurance',
      amount: 12,
      isIncludedInMonthlyTotal: false,
      isSubjectToStampDuty: false,
    },
  ];

  it('totals only the costs ticked to count', () => {
    expect(summarize(realLoan({ monthlyCosts: costs })).includedMonthlyCostsTotal).toBeCloseTo(
      35.5,
      10
    );
  });

  it('adds 4% stamp duty to a cost ticked for it', () => {
    const taxed = costs.map((cost) =>
      cost.id === 'm1' ? { ...cost, isSubjectToStampDuty: true } : cost
    );

    expect(summarize(realLoan({ monthlyCosts: taxed })).includedMonthlyCostsTotal).toBeCloseTo(
      5.5 * 1.04 + 30,
      10
    );
  });

  it('adds the counted costs to the instalment net of cashback', () => {
    atApril2025();

    const summary = summarize(
      realLoan({
        monthlyCosts: costs,
        cashbackCampaigns: [{ id: 'c1', startDate: midMonth(2025, 4), endDate: midMonth(2027, 3) }],
      })
    );

    expect(summary.currentMonthlyTotal).toBeCloseTo(
      summary.currentPayment - summary.currentCashback + 35.5,
      10
    );
  });

  it('leaves the schedule exactly as without extra costs', () => {
    expect(buildSchedule(realLoan({ monthlyCosts: costs }))).toEqual(buildSchedule(realLoan()));
  });

  it('leaves the total cost of borrowing alone', () => {
    expect(summarize(realLoan({ monthlyCosts: costs })).projectedTotalCost).toBeCloseTo(
      summarize(realLoan()).projectedTotalCost,
      8
    );
  });

  it('is the net instalment when there are no extra costs', () => {
    atApril2025();

    const summary = summarize(realLoan());

    expect(summary.currentMonthlyTotal).toBeCloseTo(summary.currentNetPayment, 10);
  });
});

describe('early repayment simulation', () => {
  const simulate = (
    year: number,
    month: number,
    amount: number,
    effect: PrepaymentEffect,
    feePercent = 0
  ): Scenario => ({
    simulation: {
      prepayments: [{ id: 's1', date: midMonth(year, month), amount, effect, feePercent }],
    },
  });

  // January 2027 is instalment #22 of the real loan.
  const january2027 = (effect: PrepaymentEffect, feePercent = 0) =>
    simulate(2027, 1, 10000, effect, feePercent);

  const loanFigures = (schedule: ReturnType<typeof buildSchedule>) =>
    schedule.map(({ payment, interest, balance }) => ({ payment, interest, balance }));

  it('changes nothing without simulated repayments', () => {
    expect(buildSchedule(realLoan(), { simulation: { prepayments: [] } })).toEqual(
      buildSchedule(realLoan())
    );
  });

  it('keeps the simulated repayment apart from the recorded ones', () => {
    const repaid = paymentNumber(buildSchedule(realLoan(), january2027('lowerInstalment')), 22);

    expect(repaid.simulatedPrepayment).toBe(10000);
    expect(repaid.prepayment).toBe(0);
  });

  describe('lowering the instalment', () => {
    it('behaves exactly like a recorded prepayment of the same month and amount', () => {
      const recorded = realLoan({
        prepayments: [
          ...realLoan().prepayments,
          { id: 'p5', date: midMonth(2027, 1), amount: 10000, feePercent: 0 },
        ],
      });

      expect(loanFigures(buildSchedule(realLoan(), january2027('lowerInstalment')))).toEqual(
        loanFigures(buildSchedule(recorded))
      );
    });

    it('lowers the instalment from the month after', () => {
      const schedule = buildSchedule(realLoan(), january2027('lowerInstalment'));
      const baseline = buildSchedule(realLoan());

      expect(paymentNumber(schedule, 22).payment).toBeCloseTo(
        paymentNumber(baseline, 22).payment,
        10
      );
      expect(paymentNumber(schedule, 23).payment).toBeLessThan(paymentNumber(baseline, 23).payment);
    });

    it('keeps the end of the loan', () => {
      expect(buildSchedule(realLoan(), january2027('lowerInstalment'))).toHaveLength(240);
    });
  });

  describe('shortening the term', () => {
    it('keeps the instalment', () => {
      const schedule = buildSchedule(realLoan(), january2027('shorterTerm'));

      expect(paymentNumber(schedule, 23).payment).toBeCloseTo(
        paymentNumber(schedule, 22).payment,
        10
      );
    });

    it('ends the loan earlier', () => {
      expect(buildSchedule(realLoan(), january2027('shorterTerm')).length).toBeLessThan(240);
    });

    // Recomputing over the original term at a reset would stretch the loan back to 240
    // instalments and quietly undo the repayment's choice.
    it('still ends on the shortened date after a later rate reset', () => {
      const withLaterReset = realLoan({
        ratePeriods: [
          ...realLoan().ratePeriods,
          { kind: 'variable', startDate: midMonth(2027, 9), euribor: 1.9, spread: 0.7 },
        ],
      });

      const shortened = buildSchedule(withLaterReset, january2027('shorterTerm'));

      expect(shortened.length).toBe(buildSchedule(realLoan(), january2027('shorterTerm')).length);
      expect(shortened.at(-1)?.balance).toBe(0);
    });

    it('works out the shorter term of an interest-free loan', () => {
      const interestFree = singleRateLoan({
        initialAmount: 2400,
        termMonths: 24,
        ratePeriods: [{ kind: 'variable', startDate: midMonth(2025, 4), euribor: 0, spread: 0 }],
      });

      // 100 € a month; after #2 and 1 200 € repaid, 1 000 € is left: ten more instalments.
      const schedule = buildSchedule(interestFree, simulate(2025, 5, 1200, 'shorterTerm'));

      expect(schedule).toHaveLength(12);
      expect(schedule.at(-1)?.balance).toBe(0);
    });
  });

  it('settles the loan when the repayment exceeds what is owed, and repays no more', () => {
    const schedule = buildSchedule(realLoan(), simulate(2027, 1, 1000000, 'lowerInstalment'));
    const repaid = paymentNumber(schedule, 22);

    expect(schedule).toHaveLength(22);
    expect(repaid.balance).toBe(0);
    expect(repaid.simulatedPrepayment).toBeLessThan(1000000);
  });

  describe('compareScenario', () => {
    it('saves interest', () => {
      expect(
        compareScenario(realLoan(), january2027('lowerInstalment')).interestSaved
      ).toBeGreaterThan(0);
    });

    it('saves instalments only when it shortens the term', () => {
      expect(compareScenario(realLoan(), january2027('lowerInstalment')).instalmentsSaved).toBe(0);
      expect(
        compareScenario(realLoan(), january2027('shorterTerm')).instalmentsSaved
      ).toBeGreaterThan(0);
    });

    it('saves more interest by shortening the term than by lowering the instalment', () => {
      expect(compareScenario(realLoan(), january2027('shorterTerm')).interestSaved).toBeGreaterThan(
        compareScenario(realLoan(), january2027('lowerInstalment')).interestSaved
      );
    });

    it('charges the fee as a percentage of the amount repaid, plus 4% stamp duty on it', () => {
      expect(compareScenario(realLoan(), january2027('lowerInstalment', 0.5)).feesPaid).toBeCloseTo(
        52,
        10
      );
    });

    it('charges each repayment its own fee, even in the same month', () => {
      const effect = compareScenario(realLoan(), {
        simulation: {
          prepayments: [
            {
              id: 's1',
              date: midMonth(2027, 1),
              amount: 10000,
              effect: 'lowerInstalment',
              feePercent: 0.5,
            },
            {
              id: 's2',
              date: midMonth(2027, 1),
              amount: 10000,
              effect: 'shorterTerm',
              feePercent: 2,
            },
          ],
        },
      });

      expect(effect.feesPaid).toBeCloseTo((50 + 200) * 1.04, 10);
    });

    it('charges no fee on the part of a repayment beyond the balance', () => {
      const balance = paymentNumber(buildSchedule(realLoan()), 22).balance;

      const effect = compareScenario(realLoan(), simulate(2027, 1, balance * 2, 'shorterTerm', 1));

      expect(effect.feesPaid).toBeCloseTo(balance * 0.01 * 1.04, 6);
    });

    it('loses cashback when the repayment falls inside a campaign', () => {
      const inCampaign = realLoan({
        cashbackCampaigns: [{ id: 'c1', startDate: midMonth(2025, 4), endDate: midMonth(2027, 3) }],
      });

      expect(
        compareScenario(inCampaign, january2027('lowerInstalment')).cashbackLost
      ).toBeGreaterThan(0);
    });

    it('loses no cashback when the campaign has ended', () => {
      const ended = realLoan({
        cashbackCampaigns: [
          { id: 'c1', startDate: midMonth(2025, 4), endDate: midMonth(2026, 12) },
        ],
      });

      expect(compareScenario(ended, january2027('lowerInstalment')).cashbackLost).toBeCloseTo(
        0,
        10
      );
    });

    it('nets the cashback lost and the fee out of the interest saved', () => {
      const effect = compareScenario(
        realLoan({
          cashbackCampaigns: [
            { id: 'c1', startDate: midMonth(2025, 4), endDate: midMonth(2027, 3) },
          ],
        }),
        january2027('lowerInstalment', 0.5)
      );

      expect(effect.netSaving).toBeCloseTo(
        effect.interestSaved - effect.cashbackLost - effect.feesPaid,
        10
      );
    });

    it('compares the instalment after the repayment with the real loan at that point', () => {
      const after = compareScenario(realLoan(), january2027('lowerInstalment')).firstChange;
      const baseline = buildSchedule(realLoan());

      expect(after?.baselineInstalment).toBeCloseTo(paymentNumber(baseline, 23).payment, 10);
      expect(after?.instalment).toBeLessThan(after?.baselineInstalment ?? 0);
      expect((after?.baselineBalance ?? 0) - (after?.balance ?? 0)).toBeCloseTo(10000, 6);
    });

    it('has nothing to compare before a repayment is applied', () => {
      expect(
        compareScenario(realLoan(), { simulation: { prepayments: [] } }).firstChange
      ).toBeUndefined();
    });
  });
});

describe('recorded early repayment fees', () => {
  const withFee = () =>
    realLoan({
      prepayments: realLoan().prepayments.map((prepayment) =>
        prepayment.id === 'p1' ? { ...prepayment, feePercent: 0.5 } : prepayment
      ),
    });

  it('counts the fee and its stamp duty in the total cost', () => {
    expect(summarize(withFee()).projectedTotalCost).toBeCloseTo(
      summarize(realLoan()).projectedTotalCost + 4000 * 0.005 * 1.04,
      8
    );
  });

  it('reports the fees of the repayments made so far', () => {
    expect(summarize(withFee()).prepaymentFeesPaid).toBeCloseTo(20.8, 10);
  });

  it('leaves the schedule itself unchanged', () => {
    const figures = (schedule: ReturnType<typeof buildSchedule>) =>
      schedule.map(({ payment, balance }) => ({ payment, balance }));

    expect(figures(buildSchedule(withFee()))).toEqual(figures(buildSchedule(realLoan())));
  });
});

describe('fixed and mixed loans', () => {
  const monthlyRate = (tan: number) => tan / 100 / 12;
  const frenchInstalment = (balance: number, tan: number, months: number) =>
    (balance * monthlyRate(tan)) / (1 - (1 + monthlyRate(tan)) ** -months);
  const inCampaign = { id: 'k1', startDate: midMonth(2025, 4), endDate: midMonth(2029, 3) };

  it('charges a fixed loan its TAN from the first instalment', () => {
    const first = paymentNumber(buildSchedule(fixedLoan()), 1);

    expect(first.payment).toBeCloseTo(frenchInstalment(180000, 3.2, 240), 8);
  });

  it('holds a fixed TAN to the end of the loan', () => {
    const rates = new Set(buildSchedule(fixedLoan()).map((payment) => payment.annualRate));

    expect([...rates]).toEqual([3.2]);
  });

  it('moves a mixed loan to euribor + spread when its fixed period ends', () => {
    // April 2027 is instalment #25.
    expect(paymentNumber(buildSchedule(mixedLoan()), 25).annualRate).toBeCloseTo(3.347, 10);
  });

  it('recomputes the instalment over the remaining term when the fixed period ends', () => {
    const schedule = buildSchedule(mixedLoan());
    const balanceBefore = paymentNumber(schedule, 24).balance;

    expect(paymentNumber(schedule, 25).payment).toBeCloseTo(
      frenchInstalment(balanceBefore, 3.347, 216),
      8
    );
  });

  it("returns the next variable period's spread as cashback during the fixed period", () => {
    const first = paymentNumber(buildSchedule(mixedLoan({ cashbackCampaigns: [inCampaign] })), 1);

    expect(first.cashback).toBeCloseTo((180000 * 0.7) / 100 / 12, 8);
  });

  it('charges the fixed TAN in full while that cashback runs', () => {
    const first = paymentNumber(buildSchedule(mixedLoan({ cashbackCampaigns: [inCampaign] })), 1);

    expect(first.interest).toBeCloseTo((180000 * 3.2) / 100 / 12, 8);
  });

  it('returns no cashback on a loan fixed for its whole life', () => {
    const schedule = buildSchedule(fixedLoan({ cashbackCampaigns: [inCampaign] }));

    expect(paymentNumber(schedule, 1).cashback).toBe(0);
  });
});

describe('usualPrepaymentFeePercent', () => {
  const offerWith = (rate: BankOffer['rate']): BankOffer => ({
    id: 'o1',
    bankName: 'Other bank',
    startDate: midMonth(2027, 1),
    rate,
    termMonths: 219,
    switchingCosts: [],
    exitFeePercent: 0,
    monthlyCosts: [],
    cashbackCampaigns: [],
    cashBonus: 0,
    refundedInstalments: 0,
  });
  const fixed = offerWith({ kind: 'fixed', tan: 2.9 });
  const mixed = offerWith({
    kind: 'mixed',
    fixedTan: 3.2,
    fixedMonths: 24,
    euribor: 2.647,
    spread: 0.5,
  });

  it('is 0.5% while the loan is on a variable rate', () => {
    expect(usualPrepaymentFeePercent(realLoan(), undefined, 2027 * 12)).toBe(0.5);
  });

  it("is 2% during the loan's own fixed period", () => {
    expect(usualPrepaymentFeePercent(mixedLoan(), undefined, 2026 * 12)).toBe(2);
  });

  it("is 0.5% once the loan's own fixed period ends", () => {
    expect(usualPrepaymentFeePercent(mixedLoan(), undefined, 2027 * 12 + 3)).toBe(0.5);
  });

  it('is 2% once the loan is on a fixed rate', () => {
    expect(usualPrepaymentFeePercent(realLoan(), fixed, 2027 * 12)).toBe(2);
  });

  it('is 0.5% before the switch to a fixed rate', () => {
    expect(usualPrepaymentFeePercent(realLoan(), fixed, 2026 * 12 + 11)).toBe(0.5);
  });

  it("is 2% during a mixed offer's fixed period", () => {
    expect(usualPrepaymentFeePercent(realLoan(), mixed, 2028 * 12 + 11)).toBe(2);
  });

  it("is 0.5% once a mixed offer's fixed period ends", () => {
    expect(usualPrepaymentFeePercent(realLoan(), mixed, 2029 * 12)).toBe(0.5);
  });
});

describe('analyseLoan', () => {
  const simulation: Scenario = {
    simulation: {
      prepayments: [
        {
          id: 's1',
          date: midMonth(2027, 1),
          amount: 10000,
          effect: 'shorterTerm',
          feePercent: 0.5,
        },
      ],
    },
  };

  it('agrees with the separate schedule, summary and comparison', () => {
    const analysis = analyseLoan(realLoan(), simulation);

    expect(analysis.schedule).toEqual(buildSchedule(realLoan(), simulation));
    expect(analysis.summary).toEqual(summarize(realLoan(), simulation));
    expect(analysis.comparison).toEqual({
      baseline: summarize(realLoan()),
      effect: compareScenario(realLoan(), simulation),
    });
  });

  it('shows the real loan with nothing to compare when no repayment is simulated', () => {
    const analysis = analyseLoan(realLoan(), { simulation: { prepayments: [] } });

    expect(analysis.schedule).toEqual(buildSchedule(realLoan()));
    expect(analysis.comparison).toBeUndefined();
  });
});

describe('bank offers', () => {
  // January 2027 is instalment #22; the real loan has 219 instalments left from there, at the
  // euribor 2.647% + 0.70% in force since September 2026.
  const offer = (overrides: Partial<BankOffer> = {}): BankOffer => ({
    id: 'o1',
    bankName: 'Other bank',
    startDate: midMonth(2027, 1),
    rate: { kind: 'variable', euribor: 2.647, spread: 0.7 },
    termMonths: 219,
    switchingCosts: [],
    exitFeePercent: 0,
    monthlyCosts: [],
    cashbackCampaigns: [],
    cashBonus: 0,
    refundedInstalments: 0,
    ...overrides,
  });
  const withOffer = (overrides: Partial<BankOffer> = {}): Scenario => ({
    offer: offer(overrides),
    simulation: { prepayments: [] },
  });
  const loanFigures = (schedule: ReturnType<typeof buildSchedule>) =>
    schedule.map(({ payment, interest, balance, cashback }) => ({
      payment,
      interest,
      balance,
      cashback,
    }));

  it('reproduces the current loan when the offer matches it', () => {
    expect(loanFigures(buildSchedule(realLoan(), withOffer()))).toEqual(
      loanFigures(buildSchedule(realLoan()))
    );
  });

  it('leaves every month before the switch exactly as it is', () => {
    const switched = buildSchedule(realLoan(), withOffer({ rate: { kind: 'fixed', tan: 2 } }));

    expect(loanFigures(switched.slice(0, 21))).toEqual(
      loanFigures(buildSchedule(realLoan()).slice(0, 21))
    );
  });

  it('marks the instalments paid to the new bank', () => {
    const schedule = buildSchedule(realLoan(), withOffer());

    expect(paymentNumber(schedule, 21).isAtNewBank).toBe(false);
    expect(paymentNumber(schedule, 22).isAtNewBank).toBe(true);
  });

  it('lowers the instalment from the switch with a lower spread', () => {
    const schedule = buildSchedule(
      realLoan(),
      withOffer({ rate: { kind: 'variable', euribor: 2.647, spread: 0.4 } })
    );

    expect(paymentNumber(schedule, 22).payment).toBeLessThan(
      paymentNumber(buildSchedule(realLoan()), 22).payment
    );
  });

  it('holds a fixed rate for the rest of the loan', () => {
    const schedule = buildSchedule(realLoan(), withOffer({ rate: { kind: 'fixed', tan: 2.9 } }));

    expect(paymentNumber(schedule, 22).annualRate).toBe(2.9);
    expect(schedule.at(-1)?.annualRate).toBe(2.9);
  });

  it('moves a mixed rate from fixed to variable after the fixed period', () => {
    const schedule = buildSchedule(
      realLoan(),
      withOffer({
        rate: { kind: 'mixed', fixedTan: 2.5, fixedMonths: 24, euribor: 2.647, spread: 0.6 },
      })
    );

    expect(paymentNumber(schedule, 45).annualRate).toBe(2.5);
    expect(paymentNumber(schedule, 46).annualRate).toBeCloseTo(3.247, 10);
    expect(paymentNumber(schedule, 46).payment).not.toBeCloseTo(
      paymentNumber(schedule, 45).payment,
      2
    );
  });

  it('runs for the term the offer sets, from the switch', () => {
    expect(buildSchedule(realLoan(), withOffer({ termMonths: 300 }))).toHaveLength(21 + 300);
  });

  it('keeps the new term through the rate change of a mixed offer', () => {
    const schedule = buildSchedule(
      realLoan(),
      withOffer({
        termMonths: 300,
        rate: { kind: 'mixed', fixedTan: 2.5, fixedMonths: 24, euribor: 2.647, spread: 0.6 },
      })
    );

    expect(schedule).toHaveLength(321);
    expect(schedule.at(-1)?.balance).toBe(0);
  });

  describe('cashback', () => {
    const loanInCampaign = () =>
      realLoan({
        cashbackCampaigns: [{ id: 'c1', startDate: midMonth(2025, 4), endDate: midMonth(2027, 3) }],
      });

    it("ends the current bank's campaign at the switch", () => {
      const schedule = buildSchedule(loanInCampaign(), withOffer());

      expect(paymentNumber(schedule, 21).cashback).toBeGreaterThan(0);
      expect(paymentNumber(schedule, 22).cashback).toBe(0);
    });

    it("starts the new bank's campaign at the switch, on its spread", () => {
      const schedule = buildSchedule(
        loanInCampaign(),
        withOffer({
          rate: { kind: 'variable', euribor: 2.647, spread: 0.5 },
          cashbackCampaigns: [
            { id: 'k1', startDate: midMonth(2027, 1), endDate: midMonth(2027, 12) },
          ],
        })
      );
      const balanceBefore = paymentNumber(schedule, 21).balance;

      expect(paymentNumber(schedule, 22).cashback).toBeCloseTo((balanceBefore * 0.5) / 100 / 12, 8);
    });

    it("returns a mixed offer's spread during its fixed period, interest staying at the fixed TAN", () => {
      const schedule = buildSchedule(
        realLoan(),
        withOffer({
          rate: { kind: 'mixed', fixedTan: 3.2, fixedMonths: 24, euribor: 2.647, spread: 0.5 },
          cashbackCampaigns: [
            { id: 'k1', startDate: midMonth(2027, 1), endDate: midMonth(2028, 12) },
          ],
        })
      );
      const balanceBefore = paymentNumber(schedule, 21).balance;
      const switchRow = paymentNumber(schedule, 22);

      expect(switchRow.annualRate).toBe(3.2);
      expect(switchRow.interest).toBeCloseTo((balanceBefore * 3.2) / 100 / 12, 8);
      expect(switchRow.cashback).toBeCloseTo((balanceBefore * 0.5) / 100 / 12, 8);
    });

    it('returns nothing on a fully fixed offer, which has no spread', () => {
      const schedule = buildSchedule(
        realLoan(),
        withOffer({
          rate: { kind: 'fixed', tan: 2.9 },
          cashbackCampaigns: [
            { id: 'k1', startDate: midMonth(2027, 1), endDate: midMonth(2027, 12) },
          ],
        })
      );

      expect(paymentNumber(schedule, 22).cashback).toBe(0);
    });
  });

  describe('compareScenario', () => {
    it('charges the exit fee on the balance transferred', () => {
      const effect = compareScenario(realLoan(), withOffer({ exitFeePercent: 0.5 }));
      const transferred = paymentNumber(buildSchedule(realLoan()), 21).balance;

      expect(effect.offer?.exitFee).toBeCloseTo(transferred * 0.005, 8);
    });

    it('counts the refunded instalments as the first payments at the new bank', () => {
      const effect = compareScenario(realLoan(), withOffer({ refundedInstalments: 2 }));
      const schedule = buildSchedule(realLoan(), withOffer());

      expect(effect.offer?.refundedInstalments).toBeCloseTo(
        paymentNumber(schedule, 22).payment + paymentNumber(schedule, 23).payment,
        8
      );
    });

    it("counts each bank's ticked monthly costs over the rest of its loan", () => {
      const effect = compareScenario(
        realLoan({
          monthlyCosts: [
            {
              id: 'm1',
              name: 'Fee',
              amount: 5,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: false,
            },
          ],
        }),
        withOffer({
          termMonths: 100,
          monthlyCosts: [
            {
              id: 'm2',
              name: 'Insurance',
              amount: 20,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: false,
            },
            {
              id: 'm3',
              name: 'Ignored',
              amount: 99,
              isIncludedInMonthlyTotal: false,
              isSubjectToStampDuty: false,
            },
          ],
        })
      );

      // 100 instalments at 20 € against the current bank's 219 at 5 €.
      expect(effect.offer?.monthlyCostsDifference).toBeCloseTo(100 * 20 - 219 * 5, 8);
    });

    it("adds stamp duty to either bank's monthly costs ticked for it", () => {
      const effect = compareScenario(
        realLoan({
          monthlyCosts: [
            {
              id: 'm1',
              name: 'Fee',
              amount: 5,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: true,
            },
          ],
        }),
        withOffer({
          termMonths: 100,
          monthlyCosts: [
            {
              id: 'm2',
              name: 'Fee',
              amount: 20,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: true,
            },
          ],
        })
      );

      expect(effect.offer?.monthlyCostsDifference).toBeCloseTo((100 * 20 - 219 * 5) * 1.04, 8);
    });

    it('nets every cost and benefit of the move into the saving', () => {
      const effect = compareScenario(
        realLoan(),
        withOffer({
          rate: { kind: 'variable', euribor: 2.647, spread: 0.4 },
          switchingCosts: [{ id: 's1', name: 'Valuation', amount: 250 }],
          exitFeePercent: 0.5,
          cashBonus: 300,
          refundedInstalments: 1,
        })
      );
      const move = effect.offer;

      expect(effect.netSaving).toBeCloseTo(
        effect.interestSaved -
          effect.cashbackLost +
          (move?.cashBonus ?? 0) +
          (move?.refundedInstalments ?? 0) -
          (move?.switchingCosts ?? 0) -
          (move?.exitFee ?? 0) -
          (move?.monthlyCostsDifference ?? 0),
        8
      );
    });

    // The Total cost tile and the Net saving tile must never disagree.
    it('makes the two total costs differ by exactly the net saving', () => {
      const effect = compareScenario(
        realLoan({
          monthlyCosts: [
            {
              id: 'm1',
              name: 'Fee',
              amount: 5,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: false,
            },
          ],
        }),
        {
          offer: offer({
            rate: { kind: 'mixed', fixedTan: 2.5, fixedMonths: 24, euribor: 2.647, spread: 0.6 },
            termMonths: 250,
            switchingCosts: [{ id: 's1', name: 'Valuation', amount: 250 }],
            exitFeePercent: 0.5,
            monthlyCosts: [
              {
                id: 'm2',
                name: 'Insurance',
                amount: 20,
                isIncludedInMonthlyTotal: true,
                isSubjectToStampDuty: false,
              },
            ],
            cashBonus: 300,
            refundedInstalments: 2,
          }),
          simulation: {
            prepayments: [
              {
                id: 'r1',
                date: midMonth(2028, 1),
                amount: 5000,
                effect: 'shorterTerm',
                feePercent: 0.5,
              },
            ],
          },
        }
      );

      expect(effect.totalCost.baseline - effect.totalCost.scenario).toBeCloseTo(
        effect.netSaving,
        6
      );
    });

    it('describes the first instalment at the new bank', () => {
      const change = compareScenario(
        realLoan(),
        withOffer({
          rate: { kind: 'variable', euribor: 2.647, spread: 0.4 },
          monthlyCosts: [
            {
              id: 'm2',
              name: 'Insurance',
              amount: 20,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: false,
            },
          ],
        })
      ).firstChange;
      const baseline = buildSchedule(realLoan());

      expect(toHouseholdMonthIndex(change?.date ?? 0)).toBe(2027 * 12);
      expect(change?.baselineInstalment).toBeCloseTo(paymentNumber(baseline, 22).payment, 8);
      expect(change?.instalment).toBeLessThan(change?.baselineInstalment ?? 0);
      expect(change?.balance).toBeCloseTo(paymentNumber(baseline, 21).balance, 8);
      expect(change?.monthlyCosts).toBe(20);
    });

    it('describes whichever comes first, a repayment or the switch', () => {
      const change = compareScenario(realLoan(), {
        offer: offer({ startDate: midMonth(2027, 6) }),
        simulation: {
          prepayments: [
            {
              id: 'r1',
              date: midMonth(2027, 1),
              amount: 5000,
              effect: 'lowerInstalment',
              feePercent: 0,
            },
          ],
        },
      }).firstChange;

      // The repayment in January changes the February instalment, before the June switch.
      expect(toHouseholdMonthIndex(change?.date ?? 0)).toBe(2027 * 12 + 1);
    });

    it('shortens the offer further with a simulated shorter-term repayment', () => {
      const offerOnly = buildSchedule(realLoan(), withOffer({ termMonths: 300 }));
      const withRepayment = buildSchedule(realLoan(), {
        offer: offer({ termMonths: 300 }),
        simulation: {
          prepayments: [
            {
              id: 'r1',
              date: midMonth(2028, 1),
              amount: 20000,
              effect: 'shorterTerm',
              feePercent: 0,
            },
          ],
        },
      });

      expect(withRepayment.length).toBeLessThan(offerOnly.length);
    });

    it('charges and gives nothing for a switch after the loan has ended', () => {
      const effect = compareScenario(
        realLoan(),
        withOffer({
          startDate: midMonth(2060, 1),
          switchingCosts: [{ id: 's', name: 'X', amount: 250 }],
          cashBonus: 300,
        })
      );

      expect(effect.offer?.switchingCosts).toBe(0);
      expect(effect.offer?.cashBonus).toBe(0);
      expect(effect.netSaving).toBeCloseTo(0, 8);
    });
  });
});

describe('loanTermsAt', () => {
  it('counts the instalments left from a month', () => {
    // From January 2027 (#22) the real loan has 219 instalments to go.
    expect(loanTermsAt(realLoan(), 2027 * 12).remainingInstalments).toBe(219);
  });

  it('gives the euribor and spread in force then', () => {
    expect(loanTermsAt(realLoan(), 2027 * 12).variableRate).toEqual({
      euribor: 2.647,
      spread: 0.7,
    });
  });

  it('gives the euribor of an earlier reset for a month before the latest one', () => {
    expect(loanTermsAt(realLoan(), 2025 * 12 + 9).variableRate?.euribor).toBe(2.055);
  });

  it('gives the variable rate that follows a fixed period running then', () => {
    expect(loanTermsAt(mixedLoan(), 2026 * 12).variableRate).toEqual({
      euribor: 2.647,
      spread: 0.7,
    });
  });

  it('has no variable rate for a loan fixed for its whole life', () => {
    expect(loanTermsAt(fixedLoan(), 2026 * 12).variableRate).toBeUndefined();
  });

  it('has nothing left after the loan ends', () => {
    expect(loanTermsAt(realLoan(), 2060 * 12).remainingInstalments).toBe(0);
  });
});
