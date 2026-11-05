import type { Mortgage } from '@/interfaces/Mortgage';

/** A short, valid loan; tests override only what they are about. */
export const loan = (overrides: Partial<Mortgage> = {}): Mortgage => ({
  id: 'loan-1',
  name: 'Crédito habitação',
  initialAmount: 180000,
  firstPaymentDate: Date.UTC(2025, 3, 15),
  termMonths: 12,
  ratePeriods: [
    { kind: 'variable', startDate: Date.UTC(2025, 3, 15), euribor: 2.614, spread: 0.7 },
  ],
  prepayments: [],
  initialCosts: [{ id: 'c1', name: 'IMT', amount: 14906.5 }],
  cashbackCampaigns: [],
  monthlyCosts: [],
  offers: [],
  createdAt: Date.UTC(2025, 3, 15),
  lastUpdated: Date.UTC(2025, 3, 15),
  ...overrides,
});
