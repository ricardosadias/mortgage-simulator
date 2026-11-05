import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferModal } from './OfferModal';
import { renderWithMantineProvider } from '@/utils/testWrapper';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';
import { toHouseholdMonthIndex } from '@/utils/householdDay';

// 240 instalments from April 2025; with "now" frozen in November 2026 the next month,
// December 2026, is instalment #21 and leaves 220 to go.
const loan: Mortgage = {
  id: 'loan-1',
  name: 'Crédito habitação',
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

const existingOffer: BankOffer = {
  id: 'offer-9',
  bankName: 'Banco Exemplo',
  startDate: Date.UTC(2027, 0, 15),
  rate: { kind: 'mixed', fixedTan: 2.5, fixedMonths: 36, euribor: 2.614, spread: 0.6 },
  termMonths: 200,
  switchingCosts: [{ id: 's1', name: 'Valuation', amount: 250 }],
  exitFeePercent: 0.5,
  monthlyCosts: [],
  cashbackCampaigns: [],
  cashBonus: 300,
  refundedInstalments: 2,
};

const renderModal = (offer?: BankOffer) => {
  const onSave = vi.fn();
  const close = vi.fn();
  renderWithMantineProvider(
    <OfferModal opened close={close} onSave={onSave} mortgage={loan} offer={offer} />
  );
  return { onSave, close };
};

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const chooseRate = (kind: 'Variable' | 'Fixed' | 'Mixed') =>
  fireEvent.click(screen.getByText(kind));
const pickStartMonth = async (month: string) => {
  fireEvent.click(screen.getByLabelText(/^First instalment at the new bank/));
  await waitFor(() => expect(screen.getByText(month)).toBeInTheDocument());
  fireEvent.click(screen.getByText(month));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 12)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OfferModal', () => {
  it('starts from the current loan: next month, the months left and today’s euribor', () => {
    renderModal();

    expect(screen.getByLabelText(/^Term \(months\)/)).toHaveValue('220');
    expect(screen.getByLabelText(/^Euribor/)).toHaveValue('2.614');
    expect(screen.getByLabelText(/^Spread/)).toHaveValue('0.7');
  });

  it('follows the start month with the term until the term is edited', async () => {
    renderModal();

    await pickStartMonth('Dec');

    expect(screen.getByLabelText(/^Term \(months\)/)).toHaveValue('220');
  });

  it('keeps a term the user typed when the start month changes', async () => {
    renderModal();
    type(/^Term \(months\)/, '300');

    await pickStartMonth('Dec');

    expect(screen.getByLabelText(/^Term \(months\)/)).toHaveValue('300');
  });

  it('saves a variable offer', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Novo');
    type(/^Spread/, '0.5');

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          bankName: 'Banco Novo',
          termMonths: 220,
          rate: { kind: 'variable', euribor: 2.614, spread: 0.5 },
        })
      )
    );
    const offer = onSave.mock.calls[0]?.[0] as BankOffer;
    expect(toHouseholdMonthIndex(offer.startDate)).toBe(2026 * 12 + 11);
  });

  it('saves a fixed offer with only its TAN', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Fixo');
    chooseRate('Fixed');
    type(/^Fixed TAN/, '2.9');

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ rate: { kind: 'fixed', tan: 2.9 } })
      )
    );
  });

  it('saves a mixed offer with both parts', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Misto');
    chooseRate('Mixed');
    type(/^Fixed TAN/, '2.5');
    type(/^Fixed for/, '36');

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          rate: { kind: 'mixed', fixedTan: 2.5, fixedMonths: 36, euribor: 2.614, spread: 0.7 },
        })
      )
    );
  });

  it('refuses a mixed offer with no fixed period', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Misto');
    chooseRate('Mixed');
    type(/^Fixed TAN/, '2.5');

    await save();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Fill in the rate/)).toBeInTheDocument();
  });

  it('refuses an offer with no bank name', async () => {
    const { onSave } = renderModal();

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a start month that is not in the future', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Novo');
    await pickStartMonth('Oct');

    await save();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Pick a month after the current one.')).toBeInTheDocument();
  });

  it('refuses more refunded instalments than the term', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Novo');
    type(/^Refunded instalments/, '500');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses an exit fee above 100%', async () => {
    const { onSave } = renderModal();
    type(/^Bank/, 'Banco Novo');
    type(/^Exit fee/, '150');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('opens an existing offer with its values and keeps its id', async () => {
    const { onSave } = renderModal(existingOffer);

    expect(screen.getByLabelText(/^Bank/)).toHaveValue('Banco Exemplo');
    expect(screen.getByLabelText(/^Fixed for/)).toHaveValue('36');
    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'offer-9', rate: existingOffer.rate, cashBonus: 300 })
      )
    );
  });

  describe('dismissing with Escape', () => {
    it('asks before discarding typed input', async () => {
      const { close } = renderModal();
      type(/^Bank/, 'Banco Novo');

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
      expect(close).not.toHaveBeenCalled();
    });

    it('closes a new form without asking when nothing was typed', () => {
      const { close } = renderModal();

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(close).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    });

    it('closes an existing one without asking when it is left untouched', () => {
      const { close } = renderModal(existingOffer);

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(close).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    });
  });
});
