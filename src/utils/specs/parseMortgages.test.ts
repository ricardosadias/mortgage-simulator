import type { BankOffer } from '@/interfaces/Mortgage';
import { loan } from '@/test/loan';
import { parseMortgages } from '@/utils/parseMortgages';

const offer: BankOffer = {
  id: 'offer-1',
  bankName: 'Banco Novo',
  startDate: Date.UTC(2027, 0, 15),
  rate: { kind: 'mixed', fixedTan: 2.9, fixedMonths: 24, euribor: 2.6, spread: 0.4 },
  termMonths: 39,
  switchingCosts: [{ id: 's1', name: 'Valuation', amount: 250 }],
  exitFeePercent: 0.5,
  monthlyCosts: [
    {
      id: 'm1',
      name: 'Account fee',
      amount: 5,
      isIncludedInMonthlyTotal: true,
      isSubjectToStampDuty: true,
    },
  ],
  cashbackCampaigns: [
    { id: 'k1', startDate: Date.UTC(2027, 0, 15), endDate: Date.UTC(2027, 11, 15) },
  ],
  cashBonus: 100,
  refundedInstalments: 1,
};

const parse = (value: unknown) => parseMortgages(JSON.stringify(value));

describe('parseMortgages', () => {
  it('reads back an exported file unchanged', () => {
    const mortgages = [
      loan({
        offers: [offer],
        prepayments: [{ id: 'p1', date: Date.UTC(2026, 0, 15), amount: 5000, feePercent: 0.5 }],
      }),
      loan({ id: 'loan-2', ratePeriods: [{ kind: 'fixed', startDate: 0, tan: 3.1 }] }),
    ];

    const result = parse(mortgages);

    expect(result).toEqual({ ok: true, mortgages });
  });

  it('drops the house of a loan exported from our-house', () => {
    const result = parse([{ ...loan(), houseId: 'house-1' }]);

    expect(result).toEqual({ ok: true, mortgages: [loan()] });
  });

  it('drops keys it does not know at any depth', () => {
    const tampered = { ...loan(), offers: [{ ...offer, rate: { ...offer.rate, extra: 1 } }] };

    const result = parse([tampered]);

    expect(result).toEqual({ ok: true, mortgages: [loan({ offers: [offer] })] });
  });

  it('keeps only the fields of the rate kind', () => {
    const mixedUp = { kind: 'fixed', startDate: 0, tan: 3, euribor: 2, spread: 1 };

    const result = parse([loan({ ratePeriods: [mixedUp as never] })]);

    expect(result.ok && result.mortgages[0]?.ratePeriods).toEqual([
      { kind: 'fixed', startDate: 0, tan: 3 },
    ]);
  });

  it('refuses text that is not JSON', () => {
    expect(parseMortgages('not json')).toEqual({ ok: false, error: 'not valid JSON' });
  });

  it('refuses a file that is not a list of loans', () => {
    expect(parse(loan())).toEqual({ ok: false, error: 'loans must be a list' });
  });

  it('refuses a loan without an opening rate', () => {
    const result = parse([{ ...loan(), ratePeriods: [] }]);

    expect(result).toEqual({ ok: false, error: 'loans[0].ratePeriods is required' });
  });

  it('names the field that is out of range', () => {
    const result = parse([loan({ offers: [{ ...offer, exitFeePercent: 150 }] })]);

    expect(result).toEqual({
      ok: false,
      error: 'loans[0].offers[0].exitFeePercent is out of range',
    });
  });

  it('refuses a missing field', () => {
    const { termMonths: _, ...withoutTerm } = loan();

    const result = parse([withoutTerm]);

    expect(result).toEqual({ ok: false, error: 'loans[0].termMonths must be a number' });
  });

  it('refuses a cashback campaign that ends before it starts', () => {
    const backwards = { id: 'k1', startDate: Date.UTC(2026, 5, 1), endDate: Date.UTC(2026, 0, 1) };

    const result = parse([loan({ cashbackCampaigns: [backwards] })]);

    expect(result).toEqual({
      ok: false,
      error: 'loans[0].cashbackCampaigns[0] ends before it starts',
    });
  });

  it('refuses two loans with the same id', () => {
    expect(parse([loan(), loan()])).toEqual({ ok: false, error: 'two loans share the same id' });
  });
});
