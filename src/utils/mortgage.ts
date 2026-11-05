import type {
  BankOffer,
  CashbackCampaign,
  Mortgage,
  MonthlyCost,
  OfferRate,
  RatePeriod,
} from '@/interfaces/Mortgage';
import {
  householdThisMonthIndex,
  startOfHouseholdMonth,
  toHouseholdMonthIndex,
} from '@/utils/householdDay';

/**
 * One instalment of an amortization schedule.
 *
 * Amounts carry full precision — rounding belongs to the display layer, so a total is not
 * the sum of 240 separately-rounded rows. The spreadsheet this mirrors rounds every row to
 * cents and ends up 159.96 € adrift at the final instalment; that drift is not reproduced.
 */
export interface ScheduledPayment {
  number: number;
  /** The month this instalment falls in, on `toHouseholdMonthIndex`'s scale. */
  monthIndex: number;
  /**
   * First instant of that month, for formatting a label. The day of the month is
   * deliberately not modelled: instalments are monthly and nothing here depends on which
   * day one lands, so there is no end-of-month clamping to get wrong.
   */
  date: number;
  /** The TAN applied, as a percentage (3.314). */
  annualRate: number;
  payment: number;
  interest: number;
  principal: number;
  /** Capital repaid on top of the instalment this month; 0 when there was none. */
  prepayment: number;
  /** Capital a simulation repays this month, kept apart from the recorded `prepayment`. */
  simulatedPrepayment: number;
  /**
   * The fees on this month's prepayments, recorded and simulated, stamp duty included —
   * charged only on what was actually repaid, so a repayment capped at the balance pays no fee
   * on the part that had nothing left to repay.
   */
  prepaymentFee: number;
  /** Whether this instalment is paid to the bank of the offer being compared. */
  isAtNewBank: boolean;
  /**
   * The spread share of this instalment's interest, returned by the bank after payment while
   * a cashback campaign runs; 0 outside one. It does not reduce `interest` — the bank charges
   * the full rate and gives this back separately.
   */
  cashback: number;
  /** Outstanding capital once this month's instalment and prepayment are applied. */
  balance: number;
}

export interface MortgageSummary {
  /** The next instalment due — or the final one, once the loan is paid off. */
  currentPayment: number;
  currentRate: number;
  currentInterest: number;
  currentPrincipal: number;
  /** The cashback due on the next instalment; 0 outside a campaign. */
  currentCashback: number;
  /** The next instalment once its cashback comes back: what it really costs that month. */
  currentNetPayment: number;
  /** The extra monthly costs ticked to count toward the monthly total. */
  includedMonthlyCostsTotal: number;
  /** What the loan costs this month: the instalment, less its cashback, plus included extras. */
  currentMonthlyTotal: number;
  /** Capital still owed after the most recent instalment. */
  balance: number;
  paymentsMade: number;
  paymentsRemaining: number;
  principalPaid: number;
  interestPaid: number;
  prepaidTotal: number;
  /** The fees, stamp duty included, on the prepayments made so far. */
  prepaymentFeesPaid: number;
  /** Everything handed to the bank so far: capital, interest and prepayments. */
  totalPaid: number;
  projectedTotalInterest: number;
  initialCostsTotal: number;
  cashbackReceived: number;
  projectedCashback: number;
  /** The month of the last instalment with cashback. Undefined when there is no campaign. */
  cashbackEndDate: number | undefined;
  /**
   * What the loan costs on top of the capital borrowed: all interest, the up-front costs and
   * the early repayment fees, less the cashback the bank returns.
   */
  projectedTotalCost: number;
  /** The month the loan clears. Undefined only for a loan with no instalments at all. */
  payoffDate: number | undefined;
}

/** What a hypothetical early repayment does to the rest of the loan. */
export type PrepaymentEffect = 'lowerInstalment' | 'shorterTerm';

/** A what-if early repayment: never stored, never mixed into the recorded history. */
export interface SimulatedPrepayment {
  id: string;
  date: number;
  amount: number;
  effect: PrepaymentEffect;
  /** The bank's fee, as a % of the amount repaid. Stamp duty on the fee comes on top. */
  feePercent: number;
}

export interface Simulation {
  prepayments: SimulatedPrepayment[];
}

/** Anything at or below half a cent is a rounding tail, not money still owed. */
const SETTLED = 0.005;

interface AppliedRate {
  month: number;
  tan: number;
  spread: number;
}

const byStart = (left: RatePeriod, right: RatePeriod) => left.startDate - right.startDate;

/**
 * The loan's rate periods as resets, in month order. A fixed period has no spread of its own,
 * but banks advertise a fixed TAN net of a spread they hand back as cashback: so during one, a
 * campaign returns the spread of the variable period that follows. Fixed to the end, there is
 * none, and nothing comes back.
 */
const appliedRatesOf = (periods: RatePeriod[]): AppliedRate[] => {
  const sorted = [...periods].sort(byStart);
  return sorted.map((period, index) => {
    const month = toHouseholdMonthIndex(period.startDate);
    if (period.kind === 'variable') {
      return { month, tan: period.euribor + period.spread, spread: period.spread };
    }
    const nextVariable = sorted
      .slice(index + 1)
      .find(
        (later): later is Extract<RatePeriod, { kind: 'variable' }> => later.kind === 'variable'
      );
    return { month, tan: period.tan, spread: nextVariable?.spread ?? 0 };
  });
};

/** The period in force in a month: the latest started by then, else the earliest. */
const periodInForce = (periods: RatePeriod[], monthIndex: number): RatePeriod | undefined => {
  const sorted = [...periods].sort(byStart);
  return (
    sorted.filter((period) => toHouseholdMonthIndex(period.startDate) <= monthIndex).at(-1) ??
    sorted[0]
  );
};

/**
 * The constant instalment that clears `balance` over `months` — the French amortization
 * formula, which is what the bank and the user's spreadsheet both use. Verified against the
 * real loan: 180 000 € over 240 months at 3.314% gives 1026.81 €, to the cent.
 */
const instalmentFor = (balance: number, annualRate: number, months: number): number => {
  const monthly = annualRate / 100 / 12;
  // An interest-free loan is the capital split evenly; the formula divides by zero there.
  if (monthly === 0) {
    return balance / months;
  }
  return (balance * monthly) / (1 - (1 + monthly) ** -months);
};

/** The rate in force for a month: the latest reset at or before it, else the opening rate. */
const rateForMonth = (
  resets: AppliedRate[],
  monthIndex: number,
  opening: AppliedRate
): AppliedRate =>
  resets.reduce((applied, reset) => (reset.month <= monthIndex ? reset : applied), opening);

/** Imposto do Selo on a bank's fee or commission, charged on top of the fee itself. */
const STAMP_DUTY = 0.04;

/** Capital repaid in one go and the fee due on all of it. */
interface Repaid {
  amount: number;
  fee: number;
}

const NOTHING_REPAID: Repaid = { amount: 0, fee: 0 };

const withRepayment = (
  running: Repaid,
  { amount, feePercent }: { amount: number; feePercent: number }
): Repaid => ({
  amount: running.amount + amount,
  fee: running.fee + amount * (feePercent / 100) * (1 + STAMP_DUTY),
});

/**
 * What is actually repaid when only `balance` is left to repay. The fee shrinks in proportion:
 * the bank charges on capital repaid, and the excess never reached it.
 */
const cappedAt = (repaid: Repaid, balance: number): Repaid => {
  if (repaid.amount <= balance) {
    return repaid;
  }
  return { amount: balance, fee: repaid.fee * (balance / repaid.amount) };
};

const prepaymentsByMonth = (mortgage: Mortgage): Map<number, Repaid> => {
  const byMonth = new Map<number, Repaid>();
  for (const prepayment of mortgage.prepayments) {
    const month = toHouseholdMonthIndex(prepayment.date);
    byMonth.set(month, withRepayment(byMonth.get(month) ?? NOTHING_REPAID, prepayment));
  }
  return byMonth;
};

type SimulatedMonth = Record<PrepaymentEffect, Repaid>;

const simulatedByMonth = (simulation: Simulation): Map<number, SimulatedMonth> => {
  const byMonth = new Map<number, SimulatedMonth>();
  for (const prepayment of simulation.prepayments) {
    const month = toHouseholdMonthIndex(prepayment.date);
    const running = byMonth.get(month) ?? {
      lowerInstalment: NOTHING_REPAID,
      shorterTerm: NOTHING_REPAID,
    };
    byMonth.set(month, {
      ...running,
      [prepayment.effect]: withRepayment(running[prepayment.effect], prepayment),
    });
  }
  return byMonth;
};

/**
 * How many more instalments of `instalment` it takes to clear `balance` — the French formula
 * solved for the term. Rounded up: the last of them is a partial one.
 */
const monthsToClear = (balance: number, annualRate: number, instalment: number): number => {
  if (balance <= SETTLED) {
    return 0;
  }
  const monthly = annualRate / 100 / 12;
  if (monthly === 0) {
    return Math.ceil(balance / instalment);
  }
  // The epsilon keeps a term that is whole up to float noise from rounding up a month.
  return Math.ceil(-Math.log(1 - (balance * monthly) / instalment) / Math.log(1 + monthly) - 1e-9);
};

const NO_SIMULATION: Simulation = { prepayments: [] };

/** What the loan is analysed under: optionally moved to another bank, optionally simulated. */
export interface Scenario {
  offer?: BankOffer;
  simulation: Simulation;
}

const CURRENT_PLAN: Scenario = { simulation: NO_SIMULATION };

/** The offer's rate as resets from its start month; a mixed offer resets once more. */
const offerResets = (rate: OfferRate, start: number): [AppliedRate, ...AppliedRate[]] => {
  switch (rate.kind) {
    case 'variable':
      return [{ month: start, tan: rate.euribor + rate.spread, spread: rate.spread }];
    // A fixed rate has no spread, so there is nothing for a spread cashback to return.
    case 'fixed':
      return [{ month: start, tan: rate.tan, spread: 0 }];
    // Banks advertise a mixed offer's fixed TAN net of the spread they hand back as cashback;
    // the TAN entered is the real one charged, and a campaign returns the spread on top of it.
    case 'mixed':
      return [
        { month: start, tan: rate.fixedTan, spread: rate.spread },
        {
          month: start + rate.fixedMonths,
          tan: rate.euribor + rate.spread,
          spread: rate.spread,
        },
      ];
  }
};

const campaignCoverage = (campaigns: CashbackCampaign[]) => {
  const ranges = campaigns.map((campaign) => ({
    first: toHouseholdMonthIndex(campaign.startDate),
    last: toHouseholdMonthIndex(campaign.endDate),
  }));
  // Overlapping campaigns cover a month once: a renewed offer replaces the old one, it does
  // not pay the spread back twice.
  return (monthIndex: number) =>
    ranges.some(({ first, last }) => first <= monthIndex && monthIndex <= last);
};

/** The month the loan moves to the offer's bank — never before its first instalment. */
const switchMonthOf = (mortgage: Mortgage, offer: BankOffer): number =>
  Math.max(
    toHouseholdMonthIndex(offer.startDate),
    toHouseholdMonthIndex(mortgage.firstPaymentDate)
  );

/**
 * The loan's full amortization schedule, at today's rate held flat into the future.
 *
 * The instalment is recomputed over the *remaining* term whenever the rate resets or a
 * prepayment lands — so a recorded prepayment lowers the instalment and leaves the term alone,
 * which is the behaviour of the user's actual loan.
 *
 * A simulation adds hypothetical prepayments. One that shortens the term keeps the instalment
 * and moves the loan's end earlier; that shortened end is what every later recompute works
 * to, so a euribor reset after it does not stretch the loan back to its original term.
 *
 * An offer moves the loan to another bank from its start month: from then on its rate, term
 * and cashback campaigns replace the current bank's. Every month before it is untouched.
 *
 * Returns an empty schedule for a loan that cannot have one (no capital, or no term).
 */
export const buildSchedule = (
  mortgage: Mortgage,
  scenario: Scenario = CURRENT_PLAN
): ScheduledPayment[] => {
  const { offer, simulation } = scenario;
  const { initialAmount, termMonths } = mortgage;
  if (initialAmount <= 0 || termMonths < 1) {
    return [];
  }

  // The earliest period is the opening rate even if it starts after the first instalment: a
  // loan cannot begin without a rate, so the earliest one is extended backwards.
  const resets = appliedRatesOf(mortgage.ratePeriods);
  const [opening] = resets;
  if (!opening) {
    return [];
  }
  const switchMonth = offer ? switchMonthOf(mortgage, offer) : Number.POSITIVE_INFINITY;
  const isAtNewBank = (monthIndex: number) => monthIndex >= switchMonth;
  const [offerOpening, ...laterOfferResets] = offer
    ? offerResets(offer.rate, switchMonth)
    : [opening];
  const offerRates = [offerOpening, ...laterOfferResets];
  const rateAt = (monthIndex: number) =>
    isAtNewBank(monthIndex)
      ? rateForMonth(offerRates, monthIndex, offerOpening)
      : rateForMonth(resets, monthIndex, opening);
  const hasCurrentCashback = campaignCoverage(mortgage.cashbackCampaigns);
  const hasOfferCashback = campaignCoverage(offer?.cashbackCampaigns ?? []);
  // The current bank's campaigns end with the move; the new bank's begin with it.
  const hasCashback = (monthIndex: number) =>
    isAtNewBank(monthIndex) ? hasOfferCashback(monthIndex) : hasCurrentCashback(monthIndex);
  const prepaid = prepaymentsByMonth(mortgage);
  const simulated = simulatedByMonth(simulation);
  const firstMonth = toHouseholdMonthIndex(mortgage.firstPaymentDate);

  const schedule: ScheduledPayment[] = [];
  let balance = initialAmount;
  let instalment = 0;
  let previousRate: number | undefined;
  let mustRecompute = true;
  // The instalment number the loan ends on. A shorter-term prepayment moves it, and so does
  // moving to a bank that sets its own term.
  let effectiveTerm = termMonths;

  for (let number = 1; number <= effectiveTerm && balance > SETTLED; number += 1) {
    const monthIndex = firstMonth + number - 1;
    if (offer && monthIndex === switchMonth) {
      effectiveTerm = number - 1 + offer.termMonths;
      mustRecompute = true;
    }
    const rate = rateAt(monthIndex);
    const annualRate = rate.tan;

    if (annualRate !== previousRate) {
      mustRecompute = true;
    }
    if (mustRecompute) {
      instalment = instalmentFor(balance, annualRate, effectiveTerm - number + 1);
      mustRecompute = false;
    }
    previousRate = annualRate;

    const interest = balance * (annualRate / 100 / 12);
    // On the balance *before* the instalment — the same base the interest is charged on — so
    // the cashback is exactly the spread part of this month's interest.
    const cashback = hasCashback(monthIndex) ? balance * (rate.spread / 100 / 12) : 0;
    // The last instalment is whatever clears the balance, never the computed one — which
    // would overshoot by the fraction of a cent the schedule has accumulated.
    const payment = Math.min(instalment, balance + interest);
    const principal = payment - interest;
    balance -= principal;

    // Prepayments in one month apply in a fixed order — recorded, then shorter-term, then
    // lower-instalment — each capped at what is still owed, so none can overshoot into credit.
    const prepayment = cappedAt(prepaid.get(monthIndex) ?? NOTHING_REPAID, balance);
    balance -= prepayment.amount;
    const month = simulated.get(monthIndex);
    const shorterTerm = cappedAt(month?.shorterTerm ?? NOTHING_REPAID, balance);
    balance -= shorterTerm.amount;
    if (shorterTerm.amount > 0) {
      effectiveTerm = number + monthsToClear(balance, annualRate, instalment);
    }
    const lowerInstalment = cappedAt(month?.lowerInstalment ?? NOTHING_REPAID, balance);
    balance -= lowerInstalment.amount;

    if (balance <= SETTLED) {
      balance = 0;
    }
    if (prepayment.amount > 0 || lowerInstalment.amount > 0) {
      mustRecompute = true;
    }

    schedule.push({
      number,
      monthIndex,
      date: startOfHouseholdMonth(monthIndex),
      annualRate,
      payment,
      interest,
      principal,
      prepayment: prepayment.amount,
      simulatedPrepayment: shorterTerm.amount + lowerInstalment.amount,
      prepaymentFee: prepayment.fee + shorterTerm.fee + lowerInstalment.fee,
      isAtNewBank: isAtNewBank(monthIndex),
      cashback,
      balance,
    });
  }

  return schedule;
};

const sumBy = <T>(items: T[], value: (item: T) => number): number =>
  items.reduce((total, item) => total + value(item), 0);

/**
 * What the loan looks like today, plus what it will cost in total.
 *
 * An instalment falling in the current month counts as made, matching how the user's
 * spreadsheet shows the current row. Past and future are split by month rather than by
 * instant, so a device whose clock is behind the household does not read the schedule a
 * month early.
 */
export const summarize = (mortgage: Mortgage, scenario: Scenario = CURRENT_PLAN): MortgageSummary =>
  summarizeSchedule(mortgage, buildSchedule(mortgage, scenario));

const summarizeSchedule = (mortgage: Mortgage, schedule: ScheduledPayment[]): MortgageSummary => {
  const thisMonth = householdThisMonthIndex();
  const made = schedule.filter((payment) => payment.monthIndex <= thisMonth);
  const upcoming = schedule.filter((payment) => payment.monthIndex > thisMonth);
  const lastMade = made.at(-1);
  // What the user owes and pays *next*; once the loan is cleared there is no next
  // instalment, so the final one stands in as the last state the loan was in.
  const current = upcoming.at(0) ?? schedule.at(-1);

  const principalPaid = sumBy(made, (payment) => payment.principal);
  const interestPaid = sumBy(made, (payment) => payment.interest);
  const prepaidTotal = sumBy(made, (payment) => payment.prepayment);
  const projectedPrepaymentFees = sumBy(schedule, (payment) => payment.prepaymentFee);
  const projectedTotalInterest = sumBy(schedule, (payment) => payment.interest);
  const initialCostsTotal = sumBy(mortgage.initialCosts, (cost) => cost.amount);
  const cashbackReceived = sumBy(made, (payment) => payment.cashback);
  const projectedCashback = sumBy(schedule, (payment) => payment.cashback);
  const currentPayment = current?.payment ?? 0;
  const currentCashback = current?.cashback ?? 0;
  const includedMonthlyCostsTotal = includedMonthlyCosts(mortgage.monthlyCosts);

  return {
    currentPayment,
    currentCashback,
    currentNetPayment: currentPayment - currentCashback,
    includedMonthlyCostsTotal,
    currentMonthlyTotal: currentPayment - currentCashback + includedMonthlyCostsTotal,
    currentRate: current?.annualRate ?? 0,
    currentInterest: current?.interest ?? 0,
    currentPrincipal: current?.principal ?? 0,
    balance: lastMade?.balance ?? mortgage.initialAmount,
    paymentsMade: made.length,
    paymentsRemaining: upcoming.length,
    principalPaid,
    interestPaid,
    prepaidTotal,
    prepaymentFeesPaid: sumBy(made, (payment) => payment.prepaymentFee),
    totalPaid: principalPaid + interestPaid + prepaidTotal,
    projectedTotalInterest,
    initialCostsTotal,
    cashbackReceived,
    projectedCashback,
    cashbackEndDate: schedule.filter((payment) => payment.cashback > 0).at(-1)?.date,
    projectedTotalCost:
      projectedTotalInterest + initialCostsTotal + projectedPrepaymentFees - projectedCashback,
    payoffDate: schedule.at(-1)?.date,
  };
};

/**
 * A loan year's totals. Years are counted in instalments, not calendar years — instalments
 * 1–12 are year 1 — because that is how the loan itself is reckoned and how the user's
 * spreadsheet totals its columns.
 */
export interface MortgageYear {
  year: number;
  /** First instant of the year's opening month, for an axis label. */
  date: number;
  interest: number;
  principal: number;
  prepayment: number;
}

/** The schedule rolled up per loan year, for a forecast that can be read at a glance. */
export const aggregateByYear = (schedule: ScheduledPayment[]): MortgageYear[] => {
  const years = new Map<number, MortgageYear>();

  for (const payment of schedule) {
    const year = Math.ceil(payment.number / 12);
    const running = years.get(year) ?? {
      year,
      date: payment.date,
      interest: 0,
      principal: 0,
      prepayment: 0,
    };
    running.interest += payment.interest;
    running.principal += payment.principal;
    running.prepayment += payment.prepayment;
    years.set(year, running);
  }

  return [...years.values()];
};

/**
 * The first instalment a scenario changes, beside the real loan at the same point: the switch
 * month for an offer, the month after a simulated repayment. A change in a future month cannot
 * touch the next instalment or today's balance, so this is where it first shows.
 */
export interface FirstChange {
  /** The month of that instalment. */
  date: number;
  /** Capital owed at the end of the month before. */
  balance: number;
  baselineBalance: number;
  /** 0 when the scenario has already cleared the loan. */
  instalment: number;
  baselineInstalment: number;
  cashback: number;
  baselineCashback: number;
  /** The ticked monthly costs of whichever bank holds the loan that month. */
  monthlyCosts: number;
  baselineMonthlyCosts: number;
}

/** The one-off and recurring money that moving the loan adds or takes away. */
export interface OfferEffect {
  bankName: string;
  switchingCosts: number;
  /** The current bank's fee on the balance transferred. */
  exitFee: number;
  cashBonus: number;
  /** What the new bank pays back of its first instalments. */
  refundedInstalments: number;
  /** The new bank's monthly costs less the current bank's, over the rest of each loan. */
  monthlyCostsDifference: number;
}

/** What a scenario changes about the loan, measured against the loan as it stands. */
export interface ScenarioEffect {
  interestSaved: number;
  /** Cashback no longer earned: a lower balance returns less spread during a campaign. */
  cashbackLost: number;
  /** The early repayment fees the scenario adds, stamp duty included. */
  feesPaid: number;
  /** Undefined when no offer is being compared. */
  offer: OfferEffect | undefined;
  /** What the scenario actually gains, after every cost and benefit above. */
  netSaving: number;
  instalmentsSaved: number;
  payoffDate: number | undefined;
  baselinePayoffDate: number | undefined;
  /**
   * The whole cost of borrowing on each side. While an offer is compared, both include the
   * ticked monthly costs from the switch to the end, so the two are like for like.
   */
  totalCost: { baseline: number; scenario: number };
  firstChange: FirstChange | undefined;
}

/** What a monthly cost really takes each month: its amount, plus stamp duty where it applies. */
export const monthlyCostCharged = (cost: MonthlyCost): number =>
  cost.isSubjectToStampDuty ? cost.amount * (1 + STAMP_DUTY) : cost.amount;

const includedMonthlyCosts = (costs: MonthlyCost[]): number =>
  sumBy(
    costs.filter((cost) => cost.isIncludedInMonthlyTotal),
    monthlyCostCharged
  );

const inMonth = (schedule: ScheduledPayment[], monthIndex: number) =>
  schedule.find((payment) => payment.monthIndex === monthIndex);

/** Capital owed at the end of a month: before the first instalment, the whole loan. */
const balanceAtEndOf = (mortgage: Mortgage, schedule: ScheduledPayment[], monthIndex: number) => {
  if (monthIndex < toHouseholdMonthIndex(mortgage.firstPaymentDate)) {
    return mortgage.initialAmount;
  }
  // Past the last instalment the loan is cleared.
  return inMonth(schedule, monthIndex)?.balance ?? 0;
};

const firstChangeOf = (
  mortgage: Mortgage,
  scenario: Scenario,
  baseline: ScheduledPayment[],
  changed: ScheduledPayment[]
): FirstChange | undefined => {
  const repayment = changed.find((payment) => payment.simulatedPrepayment > 0);
  const candidates = [
    scenario.offer ? switchMonthOf(mortgage, scenario.offer) : undefined,
    repayment ? repayment.monthIndex + 1 : undefined,
  ].filter((month): month is number => month !== undefined);
  if (candidates.length === 0) {
    return undefined;
  }
  const month = Math.min(...candidates);
  const now = inMonth(changed, month);
  const then = inMonth(baseline, month);
  const offerCosts = includedMonthlyCosts(scenario.offer?.monthlyCosts ?? []);
  const currentCosts = includedMonthlyCosts(mortgage.monthlyCosts);

  return {
    date: startOfHouseholdMonth(month),
    balance: balanceAtEndOf(mortgage, changed, month - 1),
    baselineBalance: balanceAtEndOf(mortgage, baseline, month - 1),
    instalment: now?.payment ?? 0,
    baselineInstalment: then?.payment ?? 0,
    cashback: now?.cashback ?? 0,
    baselineCashback: then?.cashback ?? 0,
    monthlyCosts: now?.isAtNewBank ? offerCosts : currentCosts,
    baselineMonthlyCosts: currentCosts,
  };
};

const offerEffectOf = (
  mortgage: Mortgage,
  offer: BankOffer,
  baseline: ScheduledPayment[],
  changed: ScheduledPayment[]
): OfferEffect => {
  const switchMonth = switchMonthOf(mortgage, offer);
  const atNewBank = changed.filter((payment) => payment.isAtNewBank);
  // A loan that is cleared before the switch never moves: nothing is charged or given.
  if (atNewBank.length === 0) {
    return {
      bankName: offer.bankName,
      switchingCosts: 0,
      exitFee: 0,
      cashBonus: 0,
      refundedInstalments: 0,
      monthlyCostsDifference: 0,
    };
  }
  const baselineFromSwitch = baseline.filter((payment) => payment.monthIndex >= switchMonth);
  const balanceTransferred = balanceAtEndOf(mortgage, changed, switchMonth - 1);

  return {
    bankName: offer.bankName,
    switchingCosts: sumBy(offer.switchingCosts, (cost) => cost.amount),
    exitFee: balanceTransferred * (offer.exitFeePercent / 100),
    cashBonus: offer.cashBonus,
    refundedInstalments: sumBy(atNewBank.slice(0, offer.refundedInstalments), (p) => p.payment),
    monthlyCostsDifference:
      includedMonthlyCosts(offer.monthlyCosts) * atNewBank.length -
      includedMonthlyCosts(mortgage.monthlyCosts) * baselineFromSwitch.length,
  };
};

export const compareScenario = (mortgage: Mortgage, scenario: Scenario): ScenarioEffect => {
  const baseline = buildSchedule(mortgage);
  const changed = buildSchedule(mortgage, scenario);
  return compareSchedules(mortgage, scenario, {
    baseline,
    changed,
    baselineSummary: summarizeSchedule(mortgage, baseline),
    changedSummary: summarizeSchedule(mortgage, changed),
  });
};

interface Analysed {
  baseline: ScheduledPayment[];
  changed: ScheduledPayment[];
  baselineSummary: MortgageSummary;
  changedSummary: MortgageSummary;
}

const compareSchedules = (
  mortgage: Mortgage,
  scenario: Scenario,
  { baseline, changed, baselineSummary, changedSummary }: Analysed
): ScenarioEffect => {
  const interestSaved =
    sumBy(baseline, (payment) => payment.interest) - sumBy(changed, (payment) => payment.interest);
  const cashbackLost =
    sumBy(baseline, (payment) => payment.cashback) - sumBy(changed, (payment) => payment.cashback);
  const feesPaid =
    sumBy(changed, (payment) => payment.prepaymentFee) -
    sumBy(baseline, (payment) => payment.prepaymentFee);
  const offer = scenario.offer
    ? offerEffectOf(mortgage, scenario.offer, baseline, changed)
    : undefined;
  const offerNet = offer
    ? offer.cashBonus +
      offer.refundedInstalments -
      offer.switchingCosts -
      offer.exitFee -
      offer.monthlyCostsDifference
    : 0;

  // Both totals carry the ticked monthly costs from the switch on, so they compare like for
  // like; that makes baseline − scenario equal to the net saving exactly.
  const switchMonth = scenario.offer ? switchMonthOf(mortgage, scenario.offer) : undefined;
  const baselineMonthlyCosts =
    switchMonth === undefined
      ? 0
      : includedMonthlyCosts(mortgage.monthlyCosts) *
        baseline.filter((payment) => payment.monthIndex >= switchMonth).length;
  const baselineTotal = baselineSummary.projectedTotalCost + baselineMonthlyCosts;

  return {
    interestSaved,
    cashbackLost,
    feesPaid,
    offer,
    netSaving: interestSaved - cashbackLost - feesPaid + offerNet,
    instalmentsSaved: baseline.length - changed.length,
    payoffDate: changed.at(-1)?.date,
    baselinePayoffDate: baseline.at(-1)?.date,
    totalCost: {
      baseline: baselineTotal,
      scenario: changedSummary.projectedTotalCost + baselineMonthlyCosts - offerNet,
    },
    firstChange: firstChangeOf(mortgage, scenario, baseline, changed),
  };
};

/** Everything a loan's page shows, with the scenario's effect when there is one. */
export interface LoanAnalysis {
  /** The schedule as shown — under the scenario, while one is set. */
  schedule: ScheduledPayment[];
  summary: MortgageSummary;
  /** The real loan and what the scenario changes; undefined for the loan as it stands. */
  comparison: { baseline: MortgageSummary; effect: ScenarioEffect } | undefined;
}

/**
 * The loan analysed once for display. Each schedule is built a single time and every figure
 * is derived from it — the page used to build five schedules per render to answer the same
 * questions.
 */
export const analyseLoan = (mortgage: Mortgage, scenario: Scenario): LoanAnalysis => {
  const baseline = buildSchedule(mortgage);
  const baselineSummary = summarizeSchedule(mortgage, baseline);
  if (!scenario.offer && scenario.simulation.prepayments.length === 0) {
    return { schedule: baseline, summary: baselineSummary, comparison: undefined };
  }

  const changed = buildSchedule(mortgage, scenario);
  const changedSummary = summarizeSchedule(mortgage, changed);
  return {
    schedule: changed,
    summary: changedSummary,
    comparison: {
      baseline: baselineSummary,
      effect: compareSchedules(mortgage, scenario, {
        baseline,
        changed,
        baselineSummary,
        changedSummary,
      }),
    },
  };
};

/** The current loan as it stands in a month: what an offer starting then is measured against. */
export interface LoanTermsAt {
  /** Instalments from that month to the end, under the current bank. */
  remainingInstalments: number;
  /**
   * The euribor and spread nearest that month: the variable period in force, else the latest
   * before it, else the first after it. Undefined for a loan fixed for its whole life.
   */
  variableRate: { euribor: number; spread: number } | undefined;
}

export const loanTermsAt = (mortgage: Mortgage, monthIndex: number): LoanTermsAt => {
  const remainingInstalments = buildSchedule(mortgage).filter(
    (payment) => payment.monthIndex >= monthIndex
  ).length;
  const variable = mortgage.ratePeriods
    .filter(
      (period): period is Extract<RatePeriod, { kind: 'variable' }> => period.kind === 'variable'
    )
    .sort(byStart);
  const nearest =
    variable.filter((period) => toHouseholdMonthIndex(period.startDate) <= monthIndex).at(-1) ??
    variable[0];
  return {
    remainingInstalments,
    variableRate: nearest && { euribor: nearest.euribor, spread: nearest.spread },
  };
};

/** What banks usually charge to repay early: more on a fixed rate, which they cannot reprice. */
export const USUAL_PREPAYMENT_FEE_PERCENT = { variable: 0.5, fixed: 2 } as const;

/** The usual early repayment fee in a month for a loan with these rate periods. */
export const usualFeeForPeriods = (periods: RatePeriod[], monthIndex: number): number =>
  periodInForce(periods, monthIndex)?.kind === 'fixed'
    ? USUAL_PREPAYMENT_FEE_PERCENT.fixed
    : USUAL_PREPAYMENT_FEE_PERCENT.variable;

/**
 * The usual early repayment fee for a month, by whether the rate in force then is fixed — at
 * the current bank, or at the offer's once the loan has moved to it.
 */
export const usualPrepaymentFeePercent = (
  mortgage: Mortgage,
  offer: BankOffer | undefined,
  monthIndex: number
): number => {
  const monthsAtNewBank = offer ? monthIndex - switchMonthOf(mortgage, offer) : -1;
  if (!offer || monthsAtNewBank < 0) {
    return usualFeeForPeriods(mortgage.ratePeriods, monthIndex);
  }
  const isFixed =
    offer.rate.kind === 'fixed' ||
    (offer.rate.kind === 'mixed' && monthsAtNewBank < offer.rate.fixedMonths);
  return isFixed ? USUAL_PREPAYMENT_FEE_PERCENT.fixed : USUAL_PREPAYMENT_FEE_PERCENT.variable;
};
