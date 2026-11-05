import { Accordion, ActionIcon, Group, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';
import type { SupportedLocale } from '@/interfaces/Settings';
import { useDeferredValue, useMemo, useState } from 'react';
import { analyseLoan, type Scenario } from '@/utils/mortgage';
import { toHouseholdMonthIndex } from '@/utils/householdDay';
import { OfferModal } from '../Modals/Mortgages/OfferModal';
import { CURRENT_BANK, OfferPicker } from './OfferPicker';
import { useMortgageSimulation } from '@/hooks/useMortgageSimulation';
import { Schedule } from './Schedule';
import { Simulator } from './Simulator';
import { Summary } from './Summary';

interface MortgageCardProps {
  mortgage: Mortgage;
  locale: SupportedLocale;
  onEdit: (mortgage: Mortgage) => void;
  onDelete: (id: string) => void;
  /** Saves the loan with a changed list of offers. */
  onUpdate: (mortgage: Mortgage) => void;
}

/** One loan: its figures, its schedule, other banks' offers and a what-if simulator. */
export const MortgageCard: React.FC<MortgageCardProps> = ({
  mortgage,
  locale,
  onEdit,
  onDelete,
  onUpdate,
}) => {
  const { t } = useTranslation('mortgages');
  // Which bank is compared is page state: choosing one to look at is not a change to the loan.
  const [selectedOfferId, setSelectedOfferId] = useState(CURRENT_BANK);
  const [offerModal, setOfferModal] = useState<{ opened: boolean; offer?: BankOffer }>({
    opened: false,
  });
  // A deleted offer simply stops being found, which falls back to the current bank.
  const selectedOffer = mortgage.offers.find((offer) => offer.id === selectedOfferId);
  const simulator = useMortgageSimulation(mortgage, selectedOffer);

  const liveScenario = useMemo<Scenario>(
    () => ({ offer: selectedOffer, simulation: simulator.simulation }),
    [selectedOffer, simulator.simulation]
  );
  // Typing in the simulator or switching banks must never wait on the analysis: the inputs
  // render at once, and the figures, table and charts follow in a background render that React
  // drops whenever another change arrives first.
  const scenario = useDeferredValue(liveScenario);
  const isCatchingUp = scenario !== liveScenario;
  const { schedule, summary, comparison } = useMemo(
    () => analyseLoan(mortgage, scenario),
    [mortgage, scenario]
  );

  // The monthly figures describe the first changed instalment; list the costs of whichever bank
  // holds the loan that month.
  const firstChange = comparison?.effect.firstChange;
  const isFirstChangeAtNewBank =
    scenario.offer !== undefined &&
    firstChange !== undefined &&
    toHouseholdMonthIndex(firstChange.date) >= toHouseholdMonthIndex(scenario.offer.startDate);

  const saveOffer = (saved: BankOffer) => {
    const exists = mortgage.offers.some((offer) => offer.id === saved.id);
    onUpdate({
      ...mortgage,
      offers: exists
        ? mortgage.offers.map((offer) => (offer.id === saved.id ? saved : offer))
        : [...mortgage.offers, saved],
      lastUpdated: Date.now(),
    });
    setSelectedOfferId(saved.id);
  };

  const deleteOffer = (id: string) =>
    onUpdate({
      ...mortgage,
      offers: mortgage.offers.filter((offer) => offer.id !== id),
      lastUpdated: Date.now(),
    });

  return (
    <Accordion.Item value={mortgage.id}>
      <Accordion.Control>
        <Text fw={600}>{mortgage.name}</Text>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="md">
          <Group justify="flex-end" gap="xs">
            <ActionIcon
              variant="subtle"
              aria-label={`${t('edit')} ${mortgage.name}`}
              onClick={() => onEdit(mortgage)}
            >
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={`${t('delete')} ${mortgage.name}`}
              onClick={() => onDelete(mortgage.id)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <OfferPicker
            offers={mortgage.offers}
            selectedId={selectedOfferId}
            onSelect={setSelectedOfferId}
            onAdd={() => setOfferModal({ opened: true })}
            onEdit={(offer) => setOfferModal({ opened: true, offer })}
            onDelete={deleteOffer}
          />
          <Simulator simulator={simulator} />
          <Stack gap="md" opacity={isCatchingUp ? 0.6 : 1}>
            <Summary
              summary={summary}
              comparison={comparison}
              monthlyCosts={
                isFirstChangeAtNewBank && scenario.offer
                  ? scenario.offer.monthlyCosts
                  : mortgage.monthlyCosts
              }
              locale={locale}
            />
            <Schedule schedule={schedule} newBankName={scenario.offer?.bankName} locale={locale} />
          </Stack>
        </Stack>
      </Accordion.Panel>
      <OfferModal
        opened={offerModal.opened}
        close={() => setOfferModal({ opened: false })}
        onSave={saveOffer}
        mortgage={mortgage}
        offer={offerModal.offer}
      />
    </Accordion.Item>
  );
};
