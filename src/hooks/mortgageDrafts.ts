import { v4 as uuidv4 } from 'uuid';
import type { CashbackCampaign, InitialCost, MonthlyCost } from '@/interfaces/Mortgage';
import {
  monthIndexOfDay,
  startOfHouseholdMonth,
  toHouseholdDay,
  type HouseholdDay,
} from '@/utils/householdDay';

// The editable shapes shared by the loan form and the offer form. Numbers are `number | string`
// because Mantine's NumberInput hands back '' for an empty field; months are the picker's own
// `YYYY-MM-DD` string, so no time zone ever gets between the month clicked and the month stored.

export interface CostDraft {
  id: string;
  name: string;
  amount: number | string;
}

export interface MonthlyCostDraft extends CostDraft {
  isIncludedInMonthlyTotal: boolean;
  isSubjectToStampDuty: boolean;
}

export interface CampaignDraft {
  id: string;
  startDate: HouseholdDay | null;
  endDate: HouseholdDay | null;
}

export const asNumber = (value: number | string): number =>
  typeof value === 'number' ? value : value === '' ? Number.NaN : Number(value);

export const isPositive = (value: number | string): boolean => {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) && parsed > 0;
};

export const isNonNegative = (value: number | string): boolean => {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) && parsed >= 0;
};

/** A percentage of something: from 0 to 100, both included. */
export const isPercent = (value: number | string): boolean =>
  isNonNegative(value) && asNumber(value) <= 100;

export const isWholePositive = (value: number | string): boolean =>
  isPositive(value) && Number.isInteger(asNumber(value));

/** A stored month as the picker's value. */
export const dayOf = (instant: number): HouseholdDay => toHouseholdDay(instant);

/** A picked month as the instant stored for it: the first instant of that household month. */
export const monthStartOf = (day: HouseholdDay): number =>
  startOfHouseholdMonth(monthIndexOfDay(day));

export const emptyCost = (): CostDraft => ({ id: uuidv4(), name: '', amount: '' });

// Ticked by default: a cost worth listing is usually one the user wants counted.
export const emptyMonthlyCost = (): MonthlyCostDraft => ({
  ...emptyCost(),
  isIncludedInMonthlyTotal: true,
  isSubjectToStampDuty: false,
});

export const emptyCampaign = (): CampaignDraft => ({
  id: uuidv4(),
  startDate: null,
  endDate: null,
});

export const costDrafts = (costs: InitialCost[]): CostDraft[] => costs.map((cost) => ({ ...cost }));

export const monthlyCostDrafts = (costs: MonthlyCost[]): MonthlyCostDraft[] =>
  costs.map((cost) => ({ ...cost }));

export const campaignDrafts = (campaigns: CashbackCampaign[]): CampaignDraft[] =>
  campaigns.map((campaign) => ({
    id: campaign.id,
    startDate: dayOf(campaign.startDate),
    endDate: dayOf(campaign.endDate),
  }));

export const hasInvalidCosts = (drafts: CostDraft[]): boolean =>
  drafts.some((cost) => cost.name.trim() === '' || !isNonNegative(cost.amount));

export const hasInvalidMonthlyCosts = (drafts: MonthlyCostDraft[]): boolean =>
  drafts.some((cost) => cost.name.trim() === '' || !isPositive(cost.amount));

export const hasInvalidCampaigns = (drafts: CampaignDraft[]): boolean =>
  drafts.some(
    ({ startDate, endDate }) =>
      startDate === null ||
      endDate === null ||
      monthIndexOfDay(endDate) < monthIndexOfDay(startDate)
  );

// The converters below run only on drafts that passed validation, so a missing month cannot
// reach them; the fallback keeps the types honest without a non-null assertion.

export const toCosts = (drafts: CostDraft[]): InitialCost[] =>
  drafts.map((cost) => ({ id: cost.id, name: cost.name.trim(), amount: asNumber(cost.amount) }));

export const toMonthlyCosts = (drafts: MonthlyCostDraft[]): MonthlyCost[] =>
  drafts.map((cost) => ({
    id: cost.id,
    name: cost.name.trim(),
    amount: asNumber(cost.amount),
    isIncludedInMonthlyTotal: cost.isIncludedInMonthlyTotal,
    isSubjectToStampDuty: cost.isSubjectToStampDuty,
  }));

export const toCampaigns = (drafts: CampaignDraft[]): CashbackCampaign[] =>
  drafts.map((campaign) => ({
    id: campaign.id,
    startDate: monthStartOf(campaign.startDate ?? ''),
    endDate: monthStartOf(campaign.endDate ?? ''),
  }));

/**
 * Whether a form's draft differs from the one it opened with. Row ids are minted fresh each time
 * a draft is built, so they are left out: two drafts with the same content are the same draft.
 */
export const isDraftEdited = (current: object, initial: object): boolean => {
  const withoutIds = (draft: object) =>
    JSON.stringify(draft, (key, value: unknown) => (key === 'id' ? undefined : value));
  return withoutIds(current) !== withoutIds(initial);
};
