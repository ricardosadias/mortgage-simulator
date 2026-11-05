import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';
import {
  usualPrepaymentFeePercent,
  type PrepaymentEffect,
  type Simulation,
  type SimulatedPrepayment,
} from '@/utils/mortgage';
import { householdThisMonthIndex, monthIndexOfDay, type HouseholdDay } from '@/utils/householdDay';
import { asNumber, isPercent, monthStartOf } from './mortgageDrafts';

export interface SimulatedRepaymentDraft {
  id: string;
  /** The picker's own `YYYY-MM-DD`, so the month never passes through a time zone. */
  date: HouseholdDay | null;
  amount: number | string;
  effect: PrepaymentEffect;
  /** The usual fee for the row's month until the user types one; '' while it has no month. */
  feePercent: number | string;
}

/** A row as held: `feePercent` stays unset until the user edits it, so it can follow the month. */
type HeldRepayment = Omit<SimulatedRepaymentDraft, 'feePercent'> & {
  feePercent?: number | string;
};

export const isPastMonth = (draft: Pick<SimulatedRepaymentDraft, 'date'>): boolean =>
  draft.date !== null && monthIndexOfDay(draft.date) <= householdThisMonthIndex();

export const hasInvalidFee = (draft: SimulatedRepaymentDraft): boolean =>
  !isPercent(draft.feePercent);

const toSimulated = (draft: SimulatedRepaymentDraft): SimulatedPrepayment | undefined => {
  const amount = asNumber(draft.amount);
  if (
    draft.date === null ||
    isPastMonth(draft) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    hasInvalidFee(draft)
  ) {
    return undefined;
  }
  return {
    id: draft.id,
    date: monthStartOf(draft.date),
    amount,
    effect: draft.effect,
    feePercent: asNumber(draft.feePercent),
  };
};

/**
 * A what-if scratchpad for one loan: hypothetical early repayments, each with the bank's fee.
 * Lives in component state on purpose — it is never saved, so it can never be mistaken for the
 * loan's recorded history.
 *
 * A row's fee starts as the usual one for the rate in force in its month, at whichever bank
 * `offer` puts the loan, and follows the month and the bank until the user types their own.
 *
 * `simulation` holds only complete, valid rows, so the preview follows the user while a row is
 * still half-typed instead of flashing errors at them.
 */
export const useMortgageSimulation = (mortgage: Mortgage, offer: BankOffer | undefined) => {
  const [held, setHeld] = useState<HeldRepayment[]>([]);

  const repayments = useMemo<SimulatedRepaymentDraft[]>(
    () =>
      held.map((row) => ({
        ...row,
        feePercent:
          row.feePercent ??
          (row.date === null
            ? ''
            : usualPrepaymentFeePercent(mortgage, offer, monthIndexOfDay(row.date))),
      })),
    [held, mortgage, offer]
  );
  // Memoized so its identity changes only when the inputs do: the card defers and memoizes the
  // expensive analysis on this object, and a fresh one per render would defeat both.
  const simulation = useMemo<Simulation>(
    () => ({
      prepayments: repayments
        .map(toSimulated)
        .filter((repayment): repayment is SimulatedPrepayment => repayment !== undefined),
    }),
    [repayments]
  );

  return {
    repayments,
    simulation,
    isSimulating: simulation.prepayments.length > 0,
    addRepayment: () =>
      setHeld((current) => [
        ...current,
        { id: uuidv4(), date: null, amount: '', effect: 'lowerInstalment' },
      ]),
    updateRepayment: (id: string, changes: Partial<Omit<SimulatedRepaymentDraft, 'id'>>) =>
      setHeld((current) =>
        current.map((repayment) => (repayment.id === id ? { ...repayment, ...changes } : repayment))
      ),
    removeRepayment: (id: string) =>
      setHeld((current) => current.filter((repayment) => repayment.id !== id)),
    clear: () => setHeld([]),
  };
};
