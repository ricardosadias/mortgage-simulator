import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Mortgage } from '@/interfaces/Mortgage';

interface MortgagesState {
  mortgages: Mortgage[];
  actions: {
    addMortgageAction: (mortgage: Mortgage) => void;
    updateMortgageAction: (mortgage: Mortgage) => void;
    removeMortgageAction: (id: string) => void;
    replaceMortgagesAction: (mortgages: Mortgage[]) => void;
  };
}

/** The user's loans. This browser's localStorage is the only copy. */
export const useMortgagesStore = create<MortgagesState, [['zustand/persist', unknown]]>(
  persist(
    (set) => ({
      mortgages: [],
      actions: {
        addMortgageAction: (mortgage) =>
          set((state) => ({ mortgages: [...state.mortgages, mortgage] })),
        updateMortgageAction: (mortgage) =>
          set((state) => ({
            mortgages: state.mortgages.map((existing) =>
              existing.id === mortgage.id ? mortgage : existing
            ),
          })),
        removeMortgageAction: (id) =>
          set((state) => ({ mortgages: state.mortgages.filter((existing) => existing.id !== id) })),
        replaceMortgagesAction: (mortgages) => set({ mortgages }),
      },
    }),
    {
      // Namespaced: every GitHub Pages project of the account shares one origin, and so one
      // localStorage.
      name: 'mortgage-simulator:loans',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ mortgages: state.mortgages }),
    }
  )
);

export const useMortgagesActions = () => useMortgagesStore((state) => state.actions);
