import { act, renderHook } from '@testing-library/react';
import { useMortgageSimulation, isPastMonth } from './useMortgageSimulation';
import { toHouseholdMonthIndex } from '@/utils/householdDay';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';

const loan: Mortgage = {
  id: 'm1',
  name: 'Loan',
  initialAmount: 180000,
  firstPaymentDate: Date.UTC(2025, 3, 15),
  termMonths: 240,
  ratePeriods: [
    { kind: 'variable', startDate: Date.UTC(2025, 3, 15), euribor: 2.614, spread: 0.7 },
  ],
  prepayments: [],
  initialCosts: [],
  cashbackCampaigns: [],
  monthlyCosts: [],
  offers: [],
  createdAt: 0,
  lastUpdated: 0,
};

const fixedFrom2027: BankOffer = {
  id: 'o1',
  bankName: 'Other bank',
  startDate: Date.UTC(2027, 0, 15),
  rate: { kind: 'fixed', tan: 2.9 },
  termMonths: 219,
  switchingCosts: [],
  exitFeePercent: 0,
  monthlyCosts: [],
  cashbackCampaigns: [],
  cashBonus: 0,
  refundedInstalments: 0,
};

afterEach(() => {
  vi.useRealTimers();
});

const atNovember2026 = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 12)));
};

describe('useMortgageSimulation', () => {
  // The picker hands back "YYYY-MM-DD". Turning that into a Date first parses it as UTC
  // midnight, which reads as the previous month on any device west of UTC — so the month is
  // taken from the string itself and this holds in every time zone.
  it('simulates the repayment in exactly the month picked', () => {
    atNovember2026();
    const { result } = renderHook(() => useMortgageSimulation(loan, undefined));

    act(() => result.current.addRepayment());
    const [row] = result.current.repayments;
    act(() => result.current.updateRepayment(row?.id ?? '', { date: '2027-01-01', amount: 1000 }));

    const [simulated] = result.current.simulation.prepayments;
    expect(toHouseholdMonthIndex(simulated?.date ?? 0)).toBe(2027 * 12);
  });

  it('leaves out a row that has no amount yet', () => {
    atNovember2026();
    const { result } = renderHook(() => useMortgageSimulation(loan, undefined));

    act(() => result.current.addRepayment());
    const [row] = result.current.repayments;
    act(() => result.current.updateRepayment(row?.id ?? '', { date: '2027-01-01' }));

    expect(result.current.isSimulating).toBe(false);
  });

  it('keeps the same simulation object while nothing in it changes', () => {
    atNovember2026();
    const { result, rerender } = renderHook(() => useMortgageSimulation(loan, undefined));
    const before = result.current.simulation;

    rerender();

    expect(result.current.simulation).toBe(before);
  });
});

describe('useMortgageSimulation fees', () => {
  const addRowIn = (
    result: { current: ReturnType<typeof useMortgageSimulation> },
    date: string
  ) => {
    act(() => result.current.addRepayment());
    const id = result.current.repayments[0]?.id ?? '';
    act(() => result.current.updateRepayment(id, { date, amount: 1000 }));
    return id;
  };

  it('has no fee until the row has a month', () => {
    atNovember2026();
    const { result } = renderHook(() => useMortgageSimulation(loan, undefined));

    act(() => result.current.addRepayment());

    expect(result.current.repayments[0]?.feePercent).toBe('');
  });

  it('follows the bank compared until a fee is typed', () => {
    atNovember2026();
    const { result, rerender } = renderHook(
      ({ offer }: { offer?: BankOffer }) => useMortgageSimulation(loan, offer),
      { initialProps: {} }
    );
    addRowIn(result, '2027-02-01');

    rerender({ offer: fixedFrom2027 });

    expect(result.current.simulation.prepayments[0]?.feePercent).toBe(2);
  });

  it('keeps a typed fee when the bank compared changes', () => {
    atNovember2026();
    const { result, rerender } = renderHook(
      ({ offer }: { offer?: BankOffer }) => useMortgageSimulation(loan, offer),
      { initialProps: {} }
    );
    const id = addRowIn(result, '2027-02-01');
    act(() => result.current.updateRepayment(id, { feePercent: 1 }));

    rerender({ offer: fixedFrom2027 });

    expect(result.current.simulation.prepayments[0]?.feePercent).toBe(1);
  });

  it('leaves out a row whose fee is not a percentage', () => {
    atNovember2026();
    const { result } = renderHook(() => useMortgageSimulation(loan, undefined));
    const id = addRowIn(result, '2027-02-01');

    act(() => result.current.updateRepayment(id, { feePercent: 150 }));

    expect(result.current.isSimulating).toBe(false);
  });
});

describe('isPastMonth', () => {
  const row = (date: string | null) => ({
    id: 'r',
    date,
    amount: 1000,
    effect: 'lowerInstalment' as const,
  });

  it('treats the current month as past', () => {
    atNovember2026();

    expect(isPastMonth(row('2026-11-01'))).toBe(true);
  });

  it('treats the next month as a valid what-if', () => {
    atNovember2026();

    expect(isPastMonth(row('2026-12-01'))).toBe(false);
  });

  it('does not judge a row with no month yet', () => {
    expect(isPastMonth(row(null))).toBe(false);
  });
});
