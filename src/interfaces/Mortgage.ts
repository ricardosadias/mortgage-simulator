/**
 * The rate a loan charges from `startDate` until the next period starts. A variable period
 * charges `euribor + spread`; a fixed one charges `tan`. A mixed loan is a fixed period
 * followed by variable ones. Rates are percentages (2.614 and 0.7, not 0.02614), as a bank
 * quotes them and the user reads them off a statement.
 *
 * `startDate` is the first payment month the rate applies to. Only the month matters — the
 * day is ignored — because a reset takes effect from a whole instalment, never part-way
 * through one.
 */
export type RatePeriod =
  | { kind: 'variable'; startDate: number; euribor: number; spread: number }
  | { kind: 'fixed'; startDate: number; tan: number };

/** A capital repayment made on top of the regular instalment. */
export interface Prepayment {
  id: string;
  date: number;
  amount: number;
  /** The bank's fee, as a % of the amount repaid. Stamp duty on the fee comes on top. */
  feePercent: number;
}

/** One line of the up-front cost of taking the loan (IMT, stamp duty, fees…). */
export interface InitialCost {
  id: string;
  name: string;
  amount: number;
}

/**
 * A period in which the bank returns the spread share of each instalment's interest once the
 * instalment is paid. Both months are inclusive and only the month matters. The interest is
 * still charged at euribor + spread; the cashback is a separate inflow, not a lower rate.
 */
export interface CashbackCampaign {
  id: string;
  startDate: number;
  endDate: number;
}

/**
 * A recurring monthly cost tied to the loan but not part of it — an account fee, an insurance
 * premium. `isIncludedInMonthlyTotal` decides whether it counts toward what the loan costs
 * each month; a cost the household would pay anyway can be listed and left out.
 */
export interface MonthlyCost {
  id: string;
  name: string;
  amount: number;
  isIncludedInMonthlyTotal: boolean;
  /** Whether 4% stamp duty (Imposto do Selo) is charged on top of `amount`, as on bank fees. */
  isSubjectToStampDuty: boolean;
}

/**
 * The rate another bank offers. A discriminated union so that no combination of fields can be
 * meaningless — a fixed offer has no spread, a variable one no fixed TAN. Percentages, as the
 * bank quotes them.
 */
export type OfferRate =
  | { kind: 'variable'; euribor: number; spread: number }
  | { kind: 'fixed'; tan: number }
  | { kind: 'mixed'; fixedTan: number; fixedMonths: number; euribor: number; spread: number };

/**
 * Moving the loan to another bank from `startDate`. Everything here replaces the current
 * bank's equivalent from that month on; nothing before it changes.
 */
export interface BankOffer {
  id: string;
  bankName: string;
  /** The month of the first instalment at the new bank. */
  startDate: number;
  rate: OfferRate;
  /** Instalments at the new bank, counted from `startDate`. */
  termMonths: number;
  switchingCosts: InitialCost[];
  /** The current bank's fee for the early repayment, as a % of the balance transferred. */
  exitFeePercent: number;
  monthlyCosts: MonthlyCost[];
  cashbackCampaigns: CashbackCampaign[];
  /** A one-off incentive, such as a prepaid card. */
  cashBonus: number;
  /** How many of the first instalments at the new bank it pays back. */
  refundedInstalments: number;
}

export interface Mortgage {
  id: string;
  name: string;
  /** Capital borrowed, before any repayment. */
  initialAmount: number;
  firstPaymentDate: number;
  termMonths: number;
  /**
   * Non-empty by construction: a loan always has an opening rate, so the engine
   * and every display site are spared an "what if there is no rate" branch.
   * Order is not guaranteed — the engine sorts.
   */
  ratePeriods: [RatePeriod, ...RatePeriod[]];
  prepayments: Prepayment[];
  initialCosts: InitialCost[];
  /**
   * Spread-cashback campaigns; empty when the loan has none. A renegotiation can renew the
   * offer before the previous one ends, so there may be several, and they may overlap.
   */
  cashbackCampaigns: CashbackCampaign[];
  monthlyCosts: MonthlyCost[];
  offers: BankOffer[];
  createdAt: number;
  lastUpdated: number;
}
