import { screen, fireEvent, waitFor } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { Mortgages } from './Mortgages';
import { renderWithMantineProvider } from '@/utils/testWrapper';
import { useMortgagesStore } from '@/store/mortgages';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// Recharts measures its container, which jsdom reports as 0×0 — the charts render nothing
// without a size and log a warning. Only the surrounding page is under test here.
vi.mock('@mantine/charts', () => ({
  AreaChart: () => <div data-testid="area-chart" />,
  BarChart: () => <div data-testid="bar-chart" />,
}));

// A short term by default: the schedule renders a row per instalment, and a 240-month loan
// costs the better part of a second per render — enough, across a file, to push other tests
// in the parallel suite past their timeout. Only the test that asserts a figure derived from
// the real 240-month term pays that cost.
const loan = (overrides: Partial<Mortgage> = {}): Mortgage => ({
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

/** Puts the loans in the store, as if saved in an earlier visit, and renders the page. */
const renderPage = async (mortgages: Mortgage[] = []) => {
  useMortgagesStore.setState({ mortgages });
  renderWithMantineProvider(<Mortgages />);
  await screen.findByRole('button', { name: 'Add loan' });
};

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
  useMortgagesStore.setState({ mortgages: [] });
  vi.clearAllMocks();
});

describe('Mortgages', () => {
  it('invites the user to add a loan when none are tracked', async () => {
    await renderPage();

    expect(screen.getByText('No loans tracked yet')).toBeInTheDocument();
  });

  it('shows the loan name once one is tracked', async () => {
    await renderPage([loan()]);

    expect(screen.getByText('Crédito habitação')).toBeInTheDocument();
  });

  it('shows the instalment the loan opens with', async () => {
    await renderPage([loan({ termMonths: 240 })]);

    // 180 000 € over 240 months at 3.314%, the figure the bank's own schedule gives.
    // Scoped to the summary tile: the same figure also appears in every schedule row.
    const tile = screen.getByText('Monthly instalment').parentElement;

    expect(tile).toHaveTextContent('1,026.81');
  });

  it('shows the full schedule for the loan', async () => {
    await renderPage([loan()]);

    expect(screen.getByText('Forecast to the final instalment')).toBeInTheDocument();
  });

  it('opens the add form', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add loan' }));

    await waitFor(() => expect(screen.getByText('Amount borrowed')).toBeInTheDocument());
  });

  it('removes a loan when its delete control is used', async () => {
    await renderPage([loan()]);

    fireEvent.click(screen.getByLabelText('Delete Crédito habitação'));

    expect(screen.queryByText('Crédito habitação')).not.toBeInTheDocument();
    expect(useMortgagesStore.getState().mortgages).toEqual([]);
  });

  it('confirms the deletion', async () => {
    await renderPage([loan()]);

    fireEvent.click(screen.getByLabelText('Delete Crédito habitação'));

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Loan deleted' })
    );
  });

  it('labels the schedule with consecutive months through the summer-time change', async () => {
    await renderPage([loan()]);

    // The fixture's 12 instalments run April 2025 to March 2026: each month once, in order.
    const labels = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[1]?.textContent);

    expect(labels).toEqual([
      'Apr 25',
      'May 25',
      'Jun 25',
      'Jul 25',
      'Aug 25',
      'Sep 25',
      'Oct 25',
      'Nov 25',
      'Dec 25',
      'Jan 26',
      'Feb 26',
      'Mar 26',
    ]);
  });

  it('shows a cashback column for a loan with a campaign', async () => {
    await renderPage([
      loan({
        cashbackCampaigns: [
          { id: 'k1', startDate: Date.UTC(2025, 3, 15), endDate: Date.UTC(2025, 8, 15) },
        ],
      }),
    ]);

    expect(screen.getByRole('columnheader', { name: 'Cashback' })).toBeInTheDocument();
  });

  it('shows no cashback column for a loan without a campaign', async () => {
    await renderPage([loan()]);

    expect(screen.queryByRole('columnheader', { name: 'Cashback' })).not.toBeInTheDocument();
  });

  it('quotes the instalment net of cashback while the campaign runs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2025, 3, 15, 12)));
    await renderPage([
      loan({
        cashbackCampaigns: [
          { id: 'k1', startDate: Date.UTC(2025, 3, 15), endDate: Date.UTC(2025, 8, 15) },
        ],
      }),
    ]);

    const tile = screen.getByText('Monthly instalment').parentElement;
    expect(tile).toHaveTextContent('after cashback');
  });

  describe('total monthly cost', () => {
    const withCosts = loan({
      monthlyCosts: [
        {
          id: 'm1',
          name: 'Account fee',
          amount: 5.5,
          isIncludedInMonthlyTotal: true,
          isSubjectToStampDuty: false,
        },
        {
          id: 'm2',
          name: 'Home insurance',
          amount: 12,
          isIncludedInMonthlyTotal: false,
          isSubjectToStampDuty: false,
        },
      ],
    });

    it('lists every monthly cost under the total', async () => {
      await renderPage([withCosts]);

      const tile = screen.getByText('Total monthly cost').parentElement;
      expect(tile).toHaveTextContent('Account fee');
      expect(tile).toHaveTextContent('Home insurance');
    });

    it('marks a cost left out of the total as not counted', async () => {
      await renderPage([withCosts]);

      expect(screen.getByText(/Home insurance/)).toHaveTextContent('Home insurance (not counted)');
    });

    it('lists a cost with its stamp duty included', async () => {
      await renderPage([
        loan({
          monthlyCosts: [
            {
              id: 'm1',
              name: 'Account fee',
              amount: 5,
              isIncludedInMonthlyTotal: true,
              isSubjectToStampDuty: true,
            },
          ],
        }),
      ]);

      const tile = screen.getByText('Total monthly cost').parentElement;
      expect(tile).toHaveTextContent('Account fee (+4% stamp duty)+ €5.20');
    });

    it('is not shown for a loan without monthly costs', async () => {
      await renderPage([loan()]);

      expect(screen.queryByText('Total monthly cost')).not.toBeInTheDocument();
    });
  });

  describe('early repayment simulator', () => {
    // A 60-month loan from April 2025 is still running in November 2026, the frozen "now".
    const running = () => loan({ termMonths: 60 });

    const renderAtNovember2026 = async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 12)));
      await renderPage([running()]);
    };

    const addRepayment = async (month: string, amount: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Add repayment' }));
      fireEvent.click(await screen.findByLabelText(/^Month/));
      await waitFor(() => expect(screen.getByText(month)).toBeInTheDocument());
      fireEvent.click(screen.getByText(month));
      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: amount } });
    };

    it('shows no savings until a repayment is simulated', async () => {
      await renderAtNovember2026();

      expect(screen.queryByText('Net saving')).not.toBeInTheDocument();
    });

    it('shows the net saving once a repayment is simulated', async () => {
      await renderAtNovember2026();

      await addRepayment('Dec', '10000');

      expect(await screen.findByText('Net saving')).toBeInTheDocument();
    });

    it('shows how the simulation moves the instalment against the current plan', async () => {
      await renderAtNovember2026();

      await addRepayment('Dec', '10000');

      const tile = screen.getByText('Monthly instalment').parentElement;
      await waitFor(() => expect(tile).toHaveTextContent(/−€[\d,.]+ vs current plan/));
    });

    it('marks the simulated repayment in the schedule', async () => {
      await renderAtNovember2026();

      await addRepayment('Dec', '10000');

      expect(await screen.findByRole('columnheader', { name: 'Simulated' })).toBeInTheDocument();
    });

    it('ignores a repayment that has no amount yet', async () => {
      await renderAtNovember2026();

      await addRepayment('Dec', '');

      expect(screen.queryByText('Net saving')).not.toBeInTheDocument();
    });

    it('refuses a repayment in the current month or earlier', async () => {
      await renderAtNovember2026();

      await addRepayment('Oct', '10000');

      expect(await screen.findByText('Pick a month after the current one.')).toBeInTheDocument();
      expect(screen.queryByText('Net saving')).not.toBeInTheDocument();
    });

    it('charges the usual variable-rate fee, plus stamp duty, until another is typed', async () => {
      await renderAtNovember2026();

      await addRepayment('Dec', '10000');

      const savings = (await screen.findByText('Net saving')).parentElement;
      expect(savings).toHaveTextContent('€52.00');
    });

    it('charges the fee typed for the repayment', async () => {
      await renderAtNovember2026();
      await addRepayment('Dec', '10000');

      fireEvent.change(screen.getByLabelText(/^Fee/), { target: { value: '2' } });

      const savings = (await screen.findByText('Net saving')).parentElement;
      await waitFor(() => expect(savings).toHaveTextContent('€208.00'));
    });

    it('refuses a fee above 100%', async () => {
      await renderAtNovember2026();
      await addRepayment('Dec', '10000');

      fireEvent.change(screen.getByLabelText(/^Fee/), {
        target: { value: '150' },
      });

      expect(await screen.findByText('Enter a percentage between 0 and 100.')).toBeInTheDocument();
    });

    it('returns to the current plan when cleared', async () => {
      await renderAtNovember2026();
      await addRepayment('Dec', '10000');
      await screen.findByText('Net saving');

      fireEvent.click(screen.getByRole('button', { name: 'Clear simulation' }));

      await waitFor(() => expect(screen.queryByText('Net saving')).not.toBeInTheDocument());
    });

    it('never writes the simulation into the saved loan', async () => {
      await renderAtNovember2026();

      await addRepayment('Dec', '10000');
      await screen.findByText('Net saving');

      expect(useMortgagesStore.getState().mortgages).toEqual([running()]);
    });
  });

  describe('bank offers', async () => {
    // A 60-month loan from April 2025, still running in November 2026, the frozen "now", with
    // an offer that moves it in January 2027 at a lower spread.
    const newBank: BankOffer = {
      id: 'offer-1',
      bankName: 'Banco Novo',
      startDate: Date.UTC(2027, 0, 15),
      rate: { kind: 'variable', euribor: 2.614, spread: 0.4 },
      termMonths: 39,
      switchingCosts: [{ id: 's1', name: 'Valuation', amount: 250 }],
      exitFeePercent: 0,
      monthlyCosts: [],
      cashbackCampaigns: [],
      cashBonus: 0,
      refundedInstalments: 0,
    };
    const withOffer = (changes: Partial<BankOffer> = {}) =>
      loan({ termMonths: 60, offers: [{ ...newBank, ...changes }] });

    const renderAtNovember2026 = async (mortgage = withOffer()) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 15, 12)));
      await renderPage([mortgage]);
    };

    const compareWith = async (bank: string) => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Compare with' }));
      fireEvent.click(await screen.findByRole('option', { name: bank }));
    };

    it('shows the loan at the current bank until an offer is chosen', async () => {
      await renderAtNovember2026();

      expect(screen.getByRole('combobox', { name: 'Compare with' })).toHaveValue('Current bank');
      expect(screen.queryByText(/^Net saving/)).not.toBeInTheDocument();
    });

    it('shows the saving of moving to the chosen bank', async () => {
      await renderAtNovember2026();

      await compareWith('Banco Novo');

      expect(await screen.findByText('Net saving with Banco Novo')).toBeInTheDocument();
    });

    it('shows how the move changes the instalment', async () => {
      await renderAtNovember2026();

      await compareWith('Banco Novo');

      const tile = screen.getByText('Monthly instalment').parentElement;
      await waitFor(() => expect(tile).toHaveTextContent(/−€[\d,.]+ vs current plan/));
      expect(tile).toHaveTextContent('From Jan 2027');
    });

    it('shows how the move changes the instalment after cashback', async () => {
      await renderAtNovember2026(
        withOffer({
          cashbackCampaigns: [
            { id: 'k1', startDate: Date.UTC(2027, 0, 15), endDate: Date.UTC(2027, 11, 15) },
          ],
        })
      );

      await compareWith('Banco Novo');

      const net = await screen.findByText(/after cashback/);
      await waitFor(() =>
        expect(net.closest('.mantine-Group-root')).toHaveTextContent(/−€[\d,.]+ vs current plan/)
      );
    });

    it('marks the month the loan moves in the schedule', async () => {
      await renderAtNovember2026();

      await compareWith('Banco Novo');

      expect(await screen.findByText('Moves to Banco Novo')).toBeInTheDocument();
    });

    it('returns to the current bank', async () => {
      await renderAtNovember2026();
      await compareWith('Banco Novo');
      await screen.findByText('Net saving with Banco Novo');

      await compareWith('Current bank');

      await waitFor(() =>
        expect(screen.queryByText('Net saving with Banco Novo')).not.toBeInTheDocument()
      );
    });

    it('never saves which bank is being compared', async () => {
      await renderAtNovember2026();

      await compareWith('Banco Novo');
      await screen.findByText('Net saving with Banco Novo');

      expect(useMortgagesStore.getState().mortgages).toEqual([withOffer()]);
    });

    it('simulates early repayments on top of the chosen offer', async () => {
      await renderAtNovember2026();
      await compareWith('Banco Novo');

      fireEvent.click(screen.getByRole('button', { name: 'Add repayment' }));
      fireEvent.click(await screen.findByLabelText(/^Month/));
      fireEvent.click(await screen.findByText('Dec'));
      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '5000' } });

      expect(await screen.findByRole('columnheader', { name: 'Simulated' })).toBeInTheDocument();
      expect(screen.getByText('Net saving with Banco Novo')).toBeInTheDocument();
    });

    it('prefills the usual fixed-rate fee for a repayment once the loan is on a fixed rate', async () => {
      await renderAtNovember2026(
        withOffer({ startDate: Date.UTC(2026, 11, 15), rate: { kind: 'fixed', tan: 2.9 } })
      );
      await compareWith('Banco Novo');

      fireEvent.click(screen.getByRole('button', { name: 'Add repayment' }));
      fireEvent.click(await screen.findByLabelText(/^Month/));
      fireEvent.click(await screen.findByText('Dec'));

      await waitFor(() => expect(screen.getByLabelText(/^Fee/)).toHaveValue('2 %'));
    });

    it('saves a new offer to the loan and compares it straight away', async () => {
      await renderAtNovember2026(loan({ termMonths: 60 }));

      fireEvent.click(screen.getByRole('button', { name: 'Add offer' }));
      fireEvent.change(await screen.findByLabelText(/^Bank/), { target: { value: 'Banco Três' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(useMortgagesStore.getState().mortgages[0]?.offers.map((o) => o.bankName)).toEqual([
          'Banco Três',
        ])
      );
      expect(await screen.findByText('Net saving with Banco Três')).toBeInTheDocument();
    });

    it('deletes the chosen offer and goes back to the current bank', async () => {
      await renderAtNovember2026();
      await compareWith('Banco Novo');

      fireEvent.click(screen.getByLabelText('Delete offer Banco Novo'));

      await waitFor(() => expect(useMortgagesStore.getState().mortgages[0]?.offers).toEqual([]));
      expect(screen.getByRole('combobox', { name: 'Compare with' })).toHaveValue('Current bank');
    });
  });
});
