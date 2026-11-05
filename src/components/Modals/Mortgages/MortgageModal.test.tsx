import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MortgageModal } from './MortgageModal';
import { renderWithMantineProvider } from '@/utils/testWrapper';
import type { Mortgage } from '@/interfaces/Mortgage';

const buildMortgage = (overrides: Partial<Mortgage> = {}): Mortgage => ({
  id: 'loan-9',
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
  createdAt: Date.UTC(2025, 3, 15),
  lastUpdated: Date.UTC(2025, 3, 15),
  ...overrides,
});

const renderModal = (props: { mortgage?: Mortgage } = {}) => {
  const onSave = vi.fn();
  const close = vi.fn();
  renderWithMantineProvider(
    <MortgageModal opened close={close} onSave={onSave} mortgage={props.mortgage} />
  );
  return { onSave, close };
};

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

// Matches the project's existing date-picker idiom: the cells are not buttons.
const pickMonth = async (label: string | RegExp, month: string) => {
  fireEvent.click(screen.getByLabelText(label));
  await waitFor(() => expect(screen.getByText(month)).toBeInTheDocument());
  fireEvent.click(screen.getByText(month));
};

/** The smallest loan the form accepts: name, amount, term, first instalment and one rate. */
const fillValidLoan = async () => {
  type(/^Name/, 'Crédito habitação');
  type(/^Amount borrowed/, '180000');
  type(/^Term \(months\)/, '240');
  await pickMonth(/^First instalment/, 'Apr');
  await pickMonth(/^From/, 'Apr');
  type(/^Euribor/, '2.614');
  type(/^Spread/, '0.7');
};

describe('MortgageModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens as an add form when given no loan', () => {
    renderModal();

    expect(screen.getByText('Add loan')).toBeInTheDocument();
  });

  it('opens as an edit form for an existing loan', () => {
    renderModal({ mortgage: buildMortgage() });

    expect(screen.getByText('Edit loan')).toBeInTheDocument();
  });

  it('starts with a row for the opening rate', () => {
    renderModal();

    expect(screen.getByLabelText(/^Euribor/)).toBeInTheDocument();
  });

  it('will not let the opening rate row be removed', () => {
    renderModal();

    expect(screen.getByLabelText('Delete Rate periods')).toBeDisabled();
  });

  it('shows no errors before the first save attempt', () => {
    renderModal();

    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('refuses to save a loan with no name', async () => {
    const { onSave } = renderModal();
    type(/^Amount borrowed/, '180000');
    type(/^Term \(months\)/, '240');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses to save a loan with no capital', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    type(/^Amount borrowed/, '0');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses to save a loan whose capital was cleared', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    type(/^Amount borrowed/, '');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses to save a loan with no term', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    type(/^Term \(months\)/, '0');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('accepts a negative euribor, which is a real rate', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    type(/^Euribor/, '-0.35');

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          ratePeriods: [expect.objectContaining({ euribor: -0.35 })],
        })
      )
    );
  });

  it('refuses to save a loan with no first instalment', async () => {
    const { onSave } = renderModal();
    type(/^Name/, 'Crédito habitação');
    type(/^Amount borrowed/, '180000');
    type(/^Term \(months\)/, '240');
    type(/^Euribor/, '2.614');
    type(/^Spread/, '0.7');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  describe('fixed rate periods', () => {
    const switchToFixed = () => fireEvent.click(screen.getByText('Fixed'));

    it('saves a fixed period with only its TAN', async () => {
      const { onSave } = renderModal({ mortgage: buildMortgage() });
      switchToFixed();
      type(/^TAN/, '3.2');

      await save();

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            ratePeriods: [{ kind: 'fixed', startDate: Date.UTC(2025, 3, 15), tan: 3.2 }],
          })
        )
      );
    });

    it('refuses a fixed period with no TAN', async () => {
      const { onSave } = renderModal({ mortgage: buildMortgage() });
      switchToFixed();

      await save();

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  it('saves a complete loan', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Crédito habitação',
          initialAmount: 180000,
          termMonths: 240,
          ratePeriods: [expect.objectContaining({ euribor: 2.614, spread: 0.7 })],
        })
      )
    );
  });

  it('keeps the id of the loan being edited', async () => {
    const { onSave } = renderModal({ mortgage: buildMortgage({ id: 'loan-9' }) });

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'loan-9' }))
    );
  });

  describe('early repayments', () => {
    const withRepayment = () =>
      buildMortgage({
        prepayments: [{ id: 'p1', date: Date.UTC(2025, 9, 1), amount: 10000, feePercent: 0.5 }],
      });

    const addRepaymentIn = async (month: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Add early repayment' }));
      await waitFor(() => expect(screen.getByLabelText(/^Month/)).toBeInTheDocument());
      await pickMonth(/^Month/, month);
    };

    it('charges the usual variable-rate fee on a repayment made on a variable rate', async () => {
      renderModal({ mortgage: buildMortgage() });

      await addRepaymentIn('Jan');

      await waitFor(() => expect(screen.getByLabelText(/^Fee/)).toHaveValue('0.5 %'));
    });

    it('charges the usual fixed-rate fee on a repayment made on a fixed rate', async () => {
      renderModal({
        mortgage: buildMortgage({
          ratePeriods: [{ kind: 'fixed', startDate: Date.UTC(2025, 3, 15), tan: 3.2 }],
        }),
      });

      await addRepaymentIn('Jan');

      await waitFor(() => expect(screen.getByLabelText(/^Fee/)).toHaveValue('2 %'));
    });

    it('saves the fee typed for a repayment', async () => {
      const { onSave } = renderModal({ mortgage: withRepayment() });

      type(/^Fee/, '2');
      await save();

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            prepayments: [expect.objectContaining({ id: 'p1', feePercent: 2 })],
          })
        )
      );
    });

    it('refuses to save a fee above 100%', async () => {
      const { onSave } = renderModal({ mortgage: withRepayment() });

      type(/^Fee/, '150');
      await save();

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  it('adds an up-front cost row on request', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));

    await waitFor(() => expect(screen.getByLabelText(/^Description/)).toBeInTheDocument());
  });

  it('refuses to save an up-front cost with no description', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));
    await waitFor(() => expect(screen.getByLabelText(/^Amount$/)).toBeInTheDocument());
    type(/^Amount$/, '1080');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes without saving when cancelled', async () => {
    const { close, onSave } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(close).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves no cashback campaigns unless one is added', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cashbackCampaigns: [] }))
    );
  });

  it('saves a cashback campaign with its start and end months', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    fireEvent.click(screen.getByRole('button', { name: 'Add cashback period' }));
    await pickMonth(/^Starts/, 'Jan');
    await pickMonth(/^Ends/, 'Dec');

    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [campaign] = onSave.mock.calls[0]?.[0].cashbackCampaigns ?? [];
    expect(new Date(campaign.startDate).getMonth()).toBe(0);
    expect(new Date(campaign.endDate).getMonth()).toBe(11);
  });

  it('refuses a cashback campaign that ends before it starts', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    fireEvent.click(screen.getByRole('button', { name: 'Add cashback period' }));
    await pickMonth(/^Starts/, 'Dec');
    await pickMonth(/^Ends/, 'Jan');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a cashback campaign with no end month', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    fireEvent.click(screen.getByRole('button', { name: 'Add cashback period' }));
    await pickMonth(/^Starts/, 'Jan');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers a second campaign row for a renewed offer', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Add cashback period' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add cashback period' }));

    expect(screen.getAllByLabelText(/^Starts/)).toHaveLength(2);
  });

  it('lists the campaigns of a loan being edited', () => {
    renderModal({
      mortgage: buildMortgage({
        cashbackCampaigns: [
          { id: 'k1', startDate: Date.UTC(2025, 3, 15), endDate: Date.UTC(2027, 2, 15) },
          { id: 'k2', startDate: Date.UTC(2026, 5, 15), endDate: Date.UTC(2028, 4, 15) },
        ],
      }),
    });

    expect(screen.getAllByLabelText(/^Starts/)).toHaveLength(2);
  });

  const addMonthlyCost = async (name: string, amount: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Add monthly cost' }));
    await waitFor(() => expect(screen.getByLabelText(/^Per month/)).toBeInTheDocument());
    const names = screen.getAllByLabelText(/^Description/);
    fireEvent.change(names[names.length - 1] as HTMLElement, { target: { value: name } });
    type(/^Per month/, amount);
  };

  it('counts a new monthly cost in the total unless unticked', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    await addMonthlyCost('Account fee', '5.5');

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyCosts: [
            expect.objectContaining({
              name: 'Account fee',
              amount: 5.5,
              isIncludedInMonthlyTotal: true,
            }),
          ],
        })
      )
    );
  });

  it('saves a monthly cost left out of the total when unticked', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    await addMonthlyCost('Home insurance', '12');
    fireEvent.click(screen.getByLabelText('Count in total'));

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyCosts: [expect.objectContaining({ isIncludedInMonthlyTotal: false })],
        })
      )
    );
  });

  it('saves stamp duty on a monthly cost when ticked', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    await addMonthlyCost('Account fee', '5.5');
    fireEvent.click(screen.getByLabelText('Imposto do selo (4%)'));

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyCosts: [expect.objectContaining({ isSubjectToStampDuty: true })],
        })
      )
    );
  });

  it('refuses a monthly cost with no description', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    await addMonthlyCost('', '5.5');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a monthly cost of zero', async () => {
    const { onSave } = renderModal();
    await fillValidLoan();
    await addMonthlyCost('Account fee', '0');

    await save();

    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows whether an existing monthly cost is counted', () => {
    renderModal({
      mortgage: buildMortgage({
        monthlyCosts: [
          {
            id: 'm1',
            name: 'Home insurance',
            amount: 12,
            isIncludedInMonthlyTotal: false,
            isSubjectToStampDuty: false,
          },
        ],
      }),
    });

    expect(screen.getByLabelText('Count in total')).not.toBeChecked();
  });

  // Offers are edited from the loan's card; saving the loan form must not drop them.
  it('keeps the saved bank offers when the loan is edited', async () => {
    const offer = {
      id: 'o1',
      bankName: 'Banco Novo',
      startDate: Date.UTC(2027, 0, 15),
      rate: { kind: 'fixed' as const, tan: 2.9 },
      termMonths: 200,
      switchingCosts: [],
      exitFeePercent: 0,
      monthlyCosts: [],
      cashbackCampaigns: [],
      cashBonus: 0,
      refundedInstalments: 0,
    };
    const { onSave } = renderModal({ mortgage: buildMortgage({ offers: [offer] }) });

    await save();

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ offers: [offer] }))
    );
  });

  describe('dismissing with Escape', () => {
    it('asks before discarding typed input', async () => {
      const { close } = renderModal();
      type(/^Name/, 'Flat');

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
      const { close } = renderModal({ mortgage: buildMortgage() });

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(close).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    });
  });
});
