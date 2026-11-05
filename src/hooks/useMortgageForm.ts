import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Mortgage, Prepayment, RatePeriod } from '@/interfaces/Mortgage';
import { usualFeeForPeriods } from '@/utils/mortgage';
import { toHouseholdMonthIndex } from '@/utils/householdDay';
import {
  asNumber,
  campaignDrafts,
  costDrafts,
  emptyCampaign,
  emptyCost,
  emptyMonthlyCost,
  hasInvalidCampaigns,
  hasInvalidCosts,
  hasInvalidMonthlyCosts,
  isDraftEdited,
  isNonNegative,
  isPercent,
  isPositive,
  monthlyCostDrafts,
  toCampaigns,
  toCosts,
  toMonthlyCosts,
  type CampaignDraft,
  type CostDraft,
  type MonthlyCostDraft,
} from './mortgageDrafts';

/**
 * The editable shape of a loan. Numbers are `number | string` because Mantine's NumberInput
 * hands back '' for an empty field, and dates are `Date | null` because its pickers do —
 * keeping the draft in the inputs' own vocabulary is what lets the form stay dumb and the
 * conversion happen in one place, on the way out.
 */
/** Holds the fields of both kinds, so switching a row's kind back and forth loses nothing. */
interface RatePeriodDraft {
  id: string;
  kind: RatePeriod['kind'];
  startDate: Date | null;
  euribor: number | string;
  spread: number | string;
  tan: number | string;
}

interface PrepaymentDraft {
  id: string;
  date: Date | null;
  amount: number | string;
  /**
   * Unset until the user types a fee: until then it is the usual fee for the rate in force in
   * the repayment's month, and follows the month and the rate periods as they are edited.
   */
  feePercent?: number | string;
}

const emptyPrepayment = (): PrepaymentDraft => ({ id: uuidv4(), date: null, amount: '' });

interface MortgageDraft {
  name: string;
  initialAmount: number | string;
  firstPaymentDate: Date | null;
  termMonths: number | string;
  ratePeriods: RatePeriodDraft[];
  prepayments: PrepaymentDraft[];
  initialCosts: CostDraft[];
  cashbackCampaigns: CampaignDraft[];
  monthlyCosts: MonthlyCostDraft[];
}

/** The draft's repeatable sub-lists, and the row type of each — so an update to one of them
 *  is checked against that list's own fields rather than against "anything with an id". */
type RowField =
  'ratePeriods' | 'prepayments' | 'initialCosts' | 'cashbackCampaigns' | 'monthlyCosts';
type RowOf<Field extends RowField> = MortgageDraft[Field][number];

/** Which fields are wrong. A field is absent from the record exactly when it is valid. */
export interface MortgageFormErrors {
  name?: true;
  initialAmount?: true;
  termMonths?: true;
  firstPaymentDate?: true;
  ratePeriods?: true;
  prepayments?: true;
  initialCosts?: true;
  cashbackCampaigns?: true;
  monthlyCosts?: true;
}

const emptyRatePeriod = (): RatePeriodDraft => ({
  id: uuidv4(),
  kind: 'variable',
  startDate: null,
  euribor: '',
  spread: '',
  tan: '',
});

const emptyDraft = (): MortgageDraft => ({
  name: '',
  initialAmount: '',
  firstPaymentDate: null,
  termMonths: '',
  // A loan always has an opening rate, so the form opens with a row for it rather than
  // making the user discover that they have to add one.
  ratePeriods: [emptyRatePeriod()],
  prepayments: [],
  initialCosts: [],
  cashbackCampaigns: [],
  monthlyCosts: [],
});

const draftFrom = (mortgage: Mortgage): MortgageDraft => ({
  name: mortgage.name,
  initialAmount: mortgage.initialAmount,
  firstPaymentDate: new Date(mortgage.firstPaymentDate),
  termMonths: mortgage.termMonths,
  ratePeriods: mortgage.ratePeriods.map((period) => ({
    ...emptyRatePeriod(),
    ...period,
    startDate: new Date(period.startDate),
  })),
  prepayments: mortgage.prepayments.map((prepayment) => ({
    id: prepayment.id,
    date: new Date(prepayment.date),
    amount: prepayment.amount,
    feePercent: prepayment.feePercent,
  })),
  initialCosts: costDrafts(mortgage.initialCosts),
  cashbackCampaigns: campaignDrafts(mortgage.cashbackCampaigns),
  monthlyCosts: monthlyCostDrafts(mortgage.monthlyCosts),
});

const ratePeriodOf = (period: RatePeriodDraft, startDate: Date): RatePeriod =>
  period.kind === 'fixed'
    ? { kind: 'fixed', startDate: startDate.getTime(), tan: asNumber(period.tan) }
    : {
        kind: 'variable',
        startDate: startDate.getTime(),
        euribor: asNumber(period.euribor),
        spread: asNumber(period.spread),
      };

/** The fee a repayment carries: the one typed, else the usual one for the rate in its month. */
const feePercentOf = (draft: MortgageDraft, prepayment: PrepaymentDraft): number | string => {
  if (prepayment.feePercent !== undefined) {
    return prepayment.feePercent;
  }
  if (prepayment.date === null) {
    return '';
  }
  const periods = draft.ratePeriods.flatMap((period) =>
    period.startDate === null ? [] : [ratePeriodOf(period, period.startDate)]
  );
  return usualFeeForPeriods(periods, toHouseholdMonthIndex(prepayment.date.getTime()));
};

const errorsIn = (draft: MortgageDraft): MortgageFormErrors => {
  const errors: MortgageFormErrors = {};

  if (draft.name.trim() === '') {
    errors.name = true;
  }
  if (!isPositive(draft.initialAmount)) {
    errors.initialAmount = true;
  }
  const term = asNumber(draft.termMonths);
  if (!isPositive(term) || !Number.isInteger(term)) {
    errors.termMonths = true;
  }
  if (draft.firstPaymentDate === null) {
    errors.firstPaymentDate = true;
  }
  // The euribor may be negative — it was for years — so it is only required to be a number.
  // A spread is a markup the bank adds, so it may be 0 but never negative; nor may a TAN.
  const ratesIncomplete = draft.ratePeriods.some(
    (period) =>
      period.startDate === null ||
      (period.kind === 'fixed'
        ? !isNonNegative(period.tan)
        : !Number.isFinite(asNumber(period.euribor)) || !isNonNegative(period.spread))
  );
  if (draft.ratePeriods.length === 0 || ratesIncomplete) {
    errors.ratePeriods = true;
  }
  if (
    draft.prepayments.some(
      (p) => p.date === null || !isPositive(p.amount) || !isPercent(feePercentOf(draft, p))
    )
  ) {
    errors.prepayments = true;
  }
  if (hasInvalidCosts(draft.initialCosts)) {
    errors.initialCosts = true;
  }
  if (hasInvalidCampaigns(draft.cashbackCampaigns)) {
    errors.cashbackCampaigns = true;
  }
  if (hasInvalidMonthlyCosts(draft.monthlyCosts)) {
    errors.monthlyCosts = true;
  }

  return errors;
};

interface MortgageFormOptions {
  /** The loan being edited, or undefined when adding a new one. */
  mortgage?: Mortgage;
  /** Resets the draft whenever the modal is reopened. */
  opened: boolean;
}

/**
 * Owns the loan form's draft, its three repeatable sub-lists and its validation, so the modal
 * stays a layout of inputs.
 *
 * Errors are derived rather than stored, and `hasSubmitted` decides whether they are shown —
 * a half-filled form the user is still typing into is not yet wrong.
 */
export const useMortgageForm = ({ mortgage, opened }: MortgageFormOptions) => {
  const [draft, setDraft] = useState<MortgageDraft>(emptyDraft);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    setDraft(mortgage ? draftFrom(mortgage) : emptyDraft());
    setHasSubmitted(false);
  }, [mortgage, opened]);

  const errors = errorsIn(draft);
  const isValid = Object.keys(errors).length === 0;

  const setValue = <Field extends keyof MortgageDraft>(field: Field, value: MortgageDraft[Field]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const updateRow = <Field extends RowField>(
    field: Field,
    id: string,
    changes: Partial<RowOf<Field>>
  ) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].map((row) => (row.id === id ? { ...row, ...changes } : row)),
    }));

  const removeRow = (field: RowField, id: string) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].filter((row) => row.id !== id),
    }));

  /**
   * The loan the draft describes. Throws when called on an invalid draft — callers gate on
   * `isValid`, so reaching this with a blank amount is a bug in the caller, not a user error.
   */
  const toMortgage = (): Mortgage => {
    const [openingRate, ...laterRates] = draft.ratePeriods;
    if (!isValid || !openingRate || draft.firstPaymentDate === null) {
      throw new Error('toMortgage called on an invalid draft');
    }
    // Captured so the narrowing survives into the closures below.
    const firstPayment = draft.firstPaymentDate;

    // Validation has established a date on every row; the fallback keeps the type honest
    // without a non-null assertion.
    const asRatePeriod = (period: RatePeriodDraft): RatePeriod =>
      ratePeriodOf(period, period.startDate ?? firstPayment);

    const prepayments: Prepayment[] = draft.prepayments.map((prepayment) => ({
      id: prepayment.id,
      date: (prepayment.date ?? firstPayment).getTime(),
      amount: asNumber(prepayment.amount),
      feePercent: asNumber(feePercentOf(draft, prepayment)),
    }));

    const now = Date.now();
    return {
      id: mortgage?.id ?? uuidv4(),
      name: draft.name.trim(),
      initialAmount: asNumber(draft.initialAmount),
      firstPaymentDate: firstPayment.getTime(),
      termMonths: asNumber(draft.termMonths),
      ratePeriods: [asRatePeriod(openingRate), ...laterRates.map(asRatePeriod)],
      prepayments,
      initialCosts: toCosts(draft.initialCosts),
      cashbackCampaigns: toCampaigns(draft.cashbackCampaigns),
      monthlyCosts: toMonthlyCosts(draft.monthlyCosts),
      // Offers are edited from the loan's card, not this form; editing the loan keeps them.
      offers: mortgage?.offers ?? [],
      createdAt: mortgage?.createdAt ?? now,
      lastUpdated: now,
    };
  };

  return {
    // Each repayment shows the fee it will be saved with, typed or followed.
    draft: {
      ...draft,
      prepayments: draft.prepayments.map((prepayment) => ({
        ...prepayment,
        feePercent: feePercentOf(draft, prepayment),
      })),
    },
    setValue,
    addRatePeriod: () =>
      setDraft((current) => ({
        ...current,
        ratePeriods: [...current.ratePeriods, emptyRatePeriod()],
      })),
    addPrepayment: () =>
      setDraft((current) => ({
        ...current,
        prepayments: [...current.prepayments, emptyPrepayment()],
      })),
    addInitialCost: () =>
      setDraft((current) => ({ ...current, initialCosts: [...current.initialCosts, emptyCost()] })),
    addCashbackCampaign: () =>
      setDraft((current) => ({
        ...current,
        cashbackCampaigns: [...current.cashbackCampaigns, emptyCampaign()],
      })),
    addMonthlyCost: () =>
      setDraft((current) => ({
        ...current,
        monthlyCosts: [...current.monthlyCosts, emptyMonthlyCost()],
      })),
    updateRow,
    removeRow,
    /** Errors worth showing: none until the user has tried to save. */
    hasUnsavedChanges: () => isDraftEdited(draft, mortgage ? draftFrom(mortgage) : emptyDraft()),
    visibleErrors: hasSubmitted ? errors : {},
    isValid,
    markSubmitted: () => setHasSubmitted(true),
    toMortgage,
  };
};
