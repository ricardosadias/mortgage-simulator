import type {
  BankOffer,
  CashbackCampaign,
  InitialCost,
  Mortgage,
  MonthlyCost,
  OfferRate,
  Prepayment,
  RatePeriod,
} from '@/interfaces/Mortgage';

const MAX_ID = 100;
const MAX_NAME = 200;
const MAX_AMOUNT = 1e8;
const MAX_TERM_MONTHS = 600;
const MAX_LOANS = 50;
const MAX_RATE_PERIODS = 50;
const MAX_PREPAYMENTS = 200;
const MAX_LIST = 50;
const MAX_OFFERS = 20;

class InvalidLoanError extends Error {}

type Fields = Record<string, unknown>;

const requireRecord = (value: unknown, field: string): Fields => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidLoanError(`${field} must be an object`);
  }
  return value as Fields;
};

const requireString = (value: unknown, field: string, max: number) => {
  if (typeof value !== 'string') {
    throw new InvalidLoanError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new InvalidLoanError(`${field} is required`);
  }
  if (trimmed.length > max) {
    throw new InvalidLoanError(`${field} is too long`);
  }
  return trimmed;
};

const requireNumber = (value: unknown, field: string, min = -Infinity, max = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidLoanError(`${field} must be a number`);
  }
  if (value < min || value > max) {
    throw new InvalidLoanError(`${field} is out of range`);
  }
  return value;
};

const requireInteger = (value: unknown, field: string, min: number, max: number) => {
  const number = requireNumber(value, field, min, max);
  if (!Number.isInteger(number)) {
    throw new InvalidLoanError(`${field} must be a whole number`);
  }
  return number;
};

const requireBoolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') {
    throw new InvalidLoanError(`${field} must be true or false`);
  }
  return value;
};

const requireId = (value: unknown, field: string) => requireString(value, field, MAX_ID);
const requireDate = (value: unknown, field: string) => requireNumber(value, field);
const requireAmount = (value: unknown, field: string) => requireNumber(value, field, 0, MAX_AMOUNT);
const requirePercent = (value: unknown, field: string) => requireNumber(value, field, 0, 100);
// Euribor was negative for years, so it is bounded but not required to be positive.
const requireEuribor = (value: unknown, field: string) => requireNumber(value, field, -5, 20);
const requireRate = (value: unknown, field: string) => requireNumber(value, field, 0, 20);
const requireTerm = (value: unknown, field: string) =>
  requireInteger(value, field, 1, MAX_TERM_MONTHS);

// Each element is rebuilt field by field, so no key the file invents survives at any depth.
const listOf = <T>(
  value: unknown,
  field: string,
  max: number,
  build: (fields: Fields, field: string) => T
): T[] => {
  if (!Array.isArray(value)) {
    throw new InvalidLoanError(`${field} must be a list`);
  }
  if (value.length > max) {
    throw new InvalidLoanError(`${field} has too many items`);
  }
  return value.map((element, index) =>
    build(requireRecord(element, `${field}[${index}]`), `${field}[${index}]`)
  );
};

const buildRatePeriod = (period: Fields, field: string): RatePeriod => {
  const startDate = requireDate(period.startDate, `${field}.startDate`);
  if (period.kind === 'fixed') {
    return { kind: 'fixed', startDate, tan: requireRate(period.tan, `${field}.tan`) };
  }
  if (period.kind === 'variable') {
    return {
      kind: 'variable',
      startDate,
      euribor: requireEuribor(period.euribor, `${field}.euribor`),
      spread: requireRate(period.spread, `${field}.spread`),
    };
  }
  throw new InvalidLoanError(`${field}.kind must be variable or fixed`);
};

const buildPrepayment = (prepayment: Fields, field: string): Prepayment => ({
  id: requireId(prepayment.id, `${field}.id`),
  date: requireDate(prepayment.date, `${field}.date`),
  amount: requireAmount(prepayment.amount, `${field}.amount`),
  feePercent: requirePercent(prepayment.feePercent, `${field}.feePercent`),
});

const buildCost = (cost: Fields, field: string): InitialCost => ({
  id: requireId(cost.id, `${field}.id`),
  name: requireString(cost.name, `${field}.name`, MAX_NAME),
  amount: requireAmount(cost.amount, `${field}.amount`),
});

const buildMonthlyCost = (cost: Fields, field: string): MonthlyCost => ({
  ...buildCost(cost, field),
  isIncludedInMonthlyTotal: requireBoolean(
    cost.isIncludedInMonthlyTotal,
    `${field}.isIncludedInMonthlyTotal`
  ),
  isSubjectToStampDuty: requireBoolean(cost.isSubjectToStampDuty, `${field}.isSubjectToStampDuty`),
});

const buildCampaign = (campaign: Fields, field: string): CashbackCampaign => {
  const startDate = requireDate(campaign.startDate, `${field}.startDate`);
  const endDate = requireDate(campaign.endDate, `${field}.endDate`);
  if (endDate < startDate) {
    throw new InvalidLoanError(`${field} ends before it starts`);
  }
  return { id: requireId(campaign.id, `${field}.id`), startDate, endDate };
};

// Only the chosen kind's fields are kept, so a rate can never mix two kinds.
const buildOfferRate = (rate: Fields, field: string): OfferRate => {
  if (rate.kind === 'fixed') {
    return { kind: 'fixed', tan: requireRate(rate.tan, `${field}.tan`) };
  }
  if (rate.kind !== 'variable' && rate.kind !== 'mixed') {
    throw new InvalidLoanError(`${field}.kind must be variable, fixed or mixed`);
  }
  const variable = {
    euribor: requireEuribor(rate.euribor, `${field}.euribor`),
    spread: requireRate(rate.spread, `${field}.spread`),
  };
  if (rate.kind === 'variable') {
    return { kind: 'variable', ...variable };
  }
  return {
    kind: 'mixed',
    fixedTan: requireRate(rate.fixedTan, `${field}.fixedTan`),
    fixedMonths: requireTerm(rate.fixedMonths, `${field}.fixedMonths`),
    ...variable,
  };
};

const buildOffer = (offer: Fields, field: string): BankOffer => {
  const termMonths = requireTerm(offer.termMonths, `${field}.termMonths`);
  return {
    id: requireId(offer.id, `${field}.id`),
    bankName: requireString(offer.bankName, `${field}.bankName`, MAX_NAME),
    startDate: requireDate(offer.startDate, `${field}.startDate`),
    rate: buildOfferRate(requireRecord(offer.rate, `${field}.rate`), `${field}.rate`),
    termMonths,
    switchingCosts: listOf(offer.switchingCosts, `${field}.switchingCosts`, MAX_LIST, buildCost),
    exitFeePercent: requirePercent(offer.exitFeePercent, `${field}.exitFeePercent`),
    monthlyCosts: listOf(offer.monthlyCosts, `${field}.monthlyCosts`, MAX_LIST, buildMonthlyCost),
    cashbackCampaigns: listOf(
      offer.cashbackCampaigns,
      `${field}.cashbackCampaigns`,
      MAX_LIST,
      buildCampaign
    ),
    cashBonus: requireAmount(offer.cashBonus, `${field}.cashBonus`),
    refundedInstalments: requireInteger(
      offer.refundedInstalments,
      `${field}.refundedInstalments`,
      0,
      termMonths
    ),
  };
};

const buildMortgage = (loan: Fields, field: string): Mortgage => {
  const [openingRate, ...laterRates] = listOf(
    loan.ratePeriods,
    `${field}.ratePeriods`,
    MAX_RATE_PERIODS,
    buildRatePeriod
  );
  // The engine's types rely on a loan always having an opening rate.
  if (!openingRate) {
    throw new InvalidLoanError(`${field}.ratePeriods is required`);
  }

  return {
    id: requireId(loan.id, `${field}.id`),
    name: requireString(loan.name, `${field}.name`, MAX_NAME),
    initialAmount: requireNumber(
      loan.initialAmount,
      `${field}.initialAmount`,
      Number.MIN_VALUE,
      MAX_AMOUNT
    ),
    firstPaymentDate: requireDate(loan.firstPaymentDate, `${field}.firstPaymentDate`),
    termMonths: requireTerm(loan.termMonths, `${field}.termMonths`),
    ratePeriods: [openingRate, ...laterRates],
    prepayments: listOf(loan.prepayments, `${field}.prepayments`, MAX_PREPAYMENTS, buildPrepayment),
    initialCosts: listOf(loan.initialCosts, `${field}.initialCosts`, MAX_LIST, buildCost),
    cashbackCampaigns: listOf(
      loan.cashbackCampaigns,
      `${field}.cashbackCampaigns`,
      MAX_LIST,
      buildCampaign
    ),
    monthlyCosts: listOf(loan.monthlyCosts, `${field}.monthlyCosts`, MAX_LIST, buildMonthlyCost),
    offers: listOf(loan.offers, `${field}.offers`, MAX_OFFERS, buildOffer),
    createdAt: requireDate(loan.createdAt, `${field}.createdAt`),
    lastUpdated: requireDate(loan.lastUpdated, `${field}.lastUpdated`),
  };
};

export type ParsedMortgages = { ok: true; mortgages: Mortgage[] } | { ok: false; error: string };

/**
 * Validates the text of an exported loans file: a JSON array of loans. Every loan is rebuilt
 * field by field with the same bounds the forms enforce, so a hand-edited or foreign file can
 * never put a shape into the store that the engine does not expect. Keys the app does not know
 * (such as `houseId` from an our-house export) are dropped. `error` names the first offending
 * field.
 */
export const parseMortgages = (text: string): ParsedMortgages => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }

  try {
    const mortgages = listOf(json, 'loans', MAX_LOANS, buildMortgage);
    const ids = new Set(mortgages.map(({ id }) => id));
    if (ids.size !== mortgages.length) {
      throw new InvalidLoanError('two loans share the same id');
    }
    return { ok: true, mortgages };
  } catch (error) {
    if (error instanceof InvalidLoanError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
};
