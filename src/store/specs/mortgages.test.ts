import { useMortgagesStore } from '@/store/mortgages';
import { loan } from '@/test/loan';

const STORAGE_KEY = 'mortgage-simulator:loans';

const storedMortgages = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')?.state.mortgages;

beforeEach(() => {
  useMortgagesStore.setState({ mortgages: [] });
});

describe('useMortgagesStore', () => {
  it('saves a new loan to localStorage', () => {
    useMortgagesStore.getState().actions.addMortgageAction(loan());

    expect(storedMortgages()).toEqual([loan()]);
  });

  it('saves an edited loan to localStorage', () => {
    useMortgagesStore.setState({ mortgages: [loan()] });

    useMortgagesStore.getState().actions.updateMortgageAction(loan({ name: 'Renamed' }));

    expect(storedMortgages()).toEqual([loan({ name: 'Renamed' })]);
  });

  it('removes a deleted loan from localStorage', () => {
    useMortgagesStore.setState({ mortgages: [loan(), loan({ id: 'loan-2' })] });

    useMortgagesStore.getState().actions.removeMortgageAction('loan-1');

    expect(storedMortgages()).toEqual([loan({ id: 'loan-2' })]);
  });

  it('restores the saved loans on the next visit', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { mortgages: [loan()] }, version: 0 })
    );

    await useMortgagesStore.persist.rehydrate();

    expect(useMortgagesStore.getState().mortgages).toEqual([loan()]);
  });
});
