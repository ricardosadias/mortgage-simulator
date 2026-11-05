import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BankOffer, Mortgage, OfferRate } from '@/interfaces/Mortgage';
import { buildSchedule, loanTermsAt } from '@/utils/mortgage';
import {
  householdThisMonthIndex,
  monthIndexOfDay,
  startOfHouseholdMonth,
  toHouseholdDay,
  type HouseholdDay,
} from '@/utils/householdDay';
import {
  asNumber,
  campaignDrafts,
  costDrafts,
  dayOf,
  emptyCampaign,
  emptyCost,
  emptyMonthlyCost,
  hasInvalidCampaigns,
  hasInvalidCosts,
  hasInvalidMonthlyCosts,
  isDraftEdited,
  isNonNegative,
  isPercent,
  isWholePositive,
  monthlyCostDrafts,
  monthStartOf,
  toCampaigns,
  toCosts,
  toMonthlyCosts,
  type CampaignDraft,
  type CostDraft,
  type MonthlyCostDraft,
} from './mortgageDrafts';

export type RateKind = OfferRate['kind'];

/**
 * The offer as the form edits it. Every rate kind keeps its own fields, so switching the kind
 * back and forth does not lose what was typed; only the chosen kind's fields are validated and
 * saved, which is where the discriminated `OfferRate` is built.
 */
interface OfferDraft {
  bankName: string;
  startDate: HouseholdDay | null;
  termMonths: number | string;
  rateKind: RateKind;
  euribor: number | string;
  spread: number | string;
  fixedTan: number | string;
  fixedMonths: number | string;
  exitFeePercent: number | string;
  cashBonus: number | string;
  refundedInstalments: number | string;
  switchingCosts: CostDraft[];
  monthlyCosts: MonthlyCostDraft[];
  cashbackCampaigns: CampaignDraft[];
}

type RowField = 'switchingCosts' | 'monthlyCosts' | 'cashbackCampaigns';
type RowOf<Field extends RowField> = OfferDraft[Field][number];

/** Which fields are wrong; a field is absent exactly when it is valid. */
export interface OfferFormErrors {
  bankName?: true;
  startDate?: 'missing' | 'notFuture' | 'afterLoanEnds';
  termMonths?: true;
  rate?: true;
  exitFeePercent?: true;
  cashBonus?: true;
  refundedInstalments?: true;
  switchingCosts?: true;
  monthlyCosts?: true;
  cashbackCampaigns?: true;
}

/** A number the user must type: blank is not zero. */
const isNumber = (value: number | string) => value !== '' && Number.isFinite(asNumber(value));

const isWholeNonNegative = (value: number | string) =>
  isNonNegative(value) && Number.isInteger(asNumber(value));

// Prefilled from the current loan in the offer's start month: the like-for-like starting point
// the user then edits into the bank's actual terms.
const prefillFor = (mortgage: Mortgage, start: HouseholdDay) => {
  const terms = loanTermsAt(mortgage, monthIndexOfDay(start));
  // A loan fixed for its whole life has no euribor or spread to start from; the user types them.
  return {
    termMonths: terms.remainingInstalments,
    euribor: terms.variableRate?.euribor ?? '',
    spread: terms.variableRate?.spread ?? '',
  };
};

const emptyDraft = (mortgage: Mortgage): OfferDraft => {
  const nextMonth = toHouseholdDay(startOfHouseholdMonth(householdThisMonthIndex() + 1));
  const prefill = prefillFor(mortgage, nextMonth);
  return {
    bankName: '',
    startDate: nextMonth,
    termMonths: prefill.termMonths,
    rateKind: 'variable',
    euribor: prefill.euribor,
    spread: prefill.spread,
    fixedTan: '',
    fixedMonths: '',
    exitFeePercent: 0,
    cashBonus: 0,
    refundedInstalments: 0,
    switchingCosts: [],
    monthlyCosts: [],
    cashbackCampaigns: [],
  };
};

const draftFrom = (offer: BankOffer): OfferDraft => {
  const { rate } = offer;
  return {
    bankName: offer.bankName,
    startDate: dayOf(offer.startDate),
    termMonths: offer.termMonths,
    rateKind: rate.kind,
    euribor: rate.kind === 'fixed' ? '' : rate.euribor,
    spread: rate.kind === 'fixed' ? '' : rate.spread,
    fixedTan: rate.kind === 'fixed' ? rate.tan : rate.kind === 'mixed' ? rate.fixedTan : '',
    fixedMonths: rate.kind === 'mixed' ? rate.fixedMonths : '',
    exitFeePercent: offer.exitFeePercent,
    cashBonus: offer.cashBonus,
    refundedInstalments: offer.refundedInstalments,
    switchingCosts: costDrafts(offer.switchingCosts),
    monthlyCosts: monthlyCostDrafts(offer.monthlyCosts),
    cashbackCampaigns: campaignDrafts(offer.cashbackCampaigns),
  };
};

const isRateValid = (draft: OfferDraft): boolean => {
  const isVariablePartValid = isNumber(draft.euribor) && isNonNegative(draft.spread);
  switch (draft.rateKind) {
    case 'variable':
      return isVariablePartValid;
    case 'fixed':
      return isNonNegative(draft.fixedTan);
    case 'mixed':
      return (
        isVariablePartValid && isNonNegative(draft.fixedTan) && isWholePositive(draft.fixedMonths)
      );
  }
};

const errorsIn = (draft: OfferDraft, mortgage: Mortgage): OfferFormErrors => {
  const errors: OfferFormErrors = {};
  if (draft.bankName.trim() === '') {
    errors.bankName = true;
  }
  if (draft.startDate === null) {
    errors.startDate = 'missing';
  } else if (monthIndexOfDay(draft.startDate) <= householdThisMonthIndex()) {
    errors.startDate = 'notFuture';
  } else if (monthIndexOfDay(draft.startDate) > (buildSchedule(mortgage).at(-1)?.monthIndex ?? 0)) {
    errors.startDate = 'afterLoanEnds';
  }
  if (!isWholePositive(draft.termMonths)) {
    errors.termMonths = true;
  }
  if (!isRateValid(draft)) {
    errors.rate = true;
  }
  if (!isPercent(draft.exitFeePercent)) {
    errors.exitFeePercent = true;
  }
  if (!isNonNegative(draft.cashBonus)) {
    errors.cashBonus = true;
  }
  if (
    !isWholeNonNegative(draft.refundedInstalments) ||
    asNumber(draft.refundedInstalments) > asNumber(draft.termMonths)
  ) {
    errors.refundedInstalments = true;
  }
  if (hasInvalidCosts(draft.switchingCosts)) {
    errors.switchingCosts = true;
  }
  if (hasInvalidMonthlyCosts(draft.monthlyCosts)) {
    errors.monthlyCosts = true;
  }
  if (hasInvalidCampaigns(draft.cashbackCampaigns)) {
    errors.cashbackCampaigns = true;
  }
  return errors;
};

const rateOf = (draft: OfferDraft): OfferRate => {
  switch (draft.rateKind) {
    case 'variable':
      return { kind: 'variable', euribor: asNumber(draft.euribor), spread: asNumber(draft.spread) };
    case 'fixed':
      return { kind: 'fixed', tan: asNumber(draft.fixedTan) };
    case 'mixed':
      return {
        kind: 'mixed',
        fixedTan: asNumber(draft.fixedTan),
        fixedMonths: asNumber(draft.fixedMonths),
        euribor: asNumber(draft.euribor),
        spread: asNumber(draft.spread),
      };
  }
};

interface OfferFormOptions {
  mortgage: Mortgage;
  /** The offer being edited, or undefined when adding one. */
  offer?: BankOffer;
  /** Resets the draft whenever the modal is reopened. */
  opened: boolean;
}

/**
 * Owns an offer's draft, its lists and its validation, so the modal stays a layout of inputs.
 * Errors are derived, and only shown once the user has tried to save.
 */
export const useOfferForm = ({ mortgage, offer, opened }: OfferFormOptions) => {
  const [draft, setDraft] = useState<OfferDraft>(() => emptyDraft(mortgage));
  const [hasSubmitted, setHasSubmitted] = useState(false);
  // Until the user types their own, the term and euribor follow the start month.
  const [isTermEdited, setIsTermEdited] = useState(false);
  const [isEuriborEdited, setIsEuriborEdited] = useState(false);

  useEffect(() => {
    setDraft(offer ? draftFrom(offer) : emptyDraft(mortgage));
    setHasSubmitted(false);
    setIsTermEdited(Boolean(offer));
    setIsEuriborEdited(Boolean(offer));
    // Reset on open or on a different offer; the loan's own edits do not reset a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, opened]);

  const errors = errorsIn(draft, mortgage);
  const isValid = Object.keys(errors).length === 0;

  const setValue = <Field extends keyof OfferDraft>(field: Field, value: OfferDraft[Field]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const setStartDate = (startDate: HouseholdDay | null) =>
    setDraft((current) => {
      if (startDate === null) {
        return { ...current, startDate };
      }
      const prefill = prefillFor(mortgage, startDate);
      return {
        ...current,
        startDate,
        termMonths: isTermEdited ? current.termMonths : prefill.termMonths,
        euribor: isEuriborEdited ? current.euribor : prefill.euribor,
      };
    });

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

  /** The offer the draft describes. Throws on an invalid draft: callers gate on `isValid`. */
  const toOffer = (): BankOffer => {
    if (!isValid || draft.startDate === null) {
      throw new Error('toOffer called on an invalid draft');
    }
    return {
      id: offer?.id ?? uuidv4(),
      bankName: draft.bankName.trim(),
      startDate: monthStartOf(draft.startDate),
      rate: rateOf(draft),
      termMonths: asNumber(draft.termMonths),
      switchingCosts: toCosts(draft.switchingCosts),
      exitFeePercent: asNumber(draft.exitFeePercent),
      monthlyCosts: toMonthlyCosts(draft.monthlyCosts),
      cashbackCampaigns: toCampaigns(draft.cashbackCampaigns),
      cashBonus: asNumber(draft.cashBonus),
      refundedInstalments: asNumber(draft.refundedInstalments),
    };
  };

  return {
    draft,
    setValue,
    setStartDate,
    setTermMonths: (value: number | string) => {
      setIsTermEdited(true);
      setValue('termMonths', value);
    },
    setEuribor: (value: number | string) => {
      setIsEuriborEdited(true);
      setValue('euribor', value);
    },
    addSwitchingCost: () =>
      setDraft((current) => ({
        ...current,
        switchingCosts: [...current.switchingCosts, emptyCost()],
      })),
    addMonthlyCost: () =>
      setDraft((current) => ({
        ...current,
        monthlyCosts: [...current.monthlyCosts, emptyMonthlyCost()],
      })),
    addCashbackCampaign: () =>
      setDraft((current) => ({
        ...current,
        cashbackCampaigns: [...current.cashbackCampaigns, emptyCampaign()],
      })),
    updateRow,
    removeRow,
    hasUnsavedChanges: () => isDraftEdited(draft, offer ? draftFrom(offer) : emptyDraft(mortgage)),
    visibleErrors: hasSubmitted ? errors : {},
    isValid,
    markSubmitted: () => setHasSubmitted(true),
    toOffer,
  };
};
