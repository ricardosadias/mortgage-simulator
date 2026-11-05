import {
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useTranslation } from 'react-i18next';
import type { BankOffer, Mortgage } from '@/interfaces/Mortgage';
import { useOfferForm, type RateKind } from '@/hooks/useOfferForm';
import { CampaignRows } from './rows/CampaignRows';
import { CostRows } from './rows/CostRows';
import { MonthlyCostRows } from './rows/MonthlyCostRows';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

interface OfferModalProps {
  opened: boolean;
  close: () => void;
  onSave: (offer: BankOffer) => void;
  mortgage: Mortgage;
  offer?: BankOffer;
}

export const OfferModal: React.FC<OfferModalProps> = ({
  opened,
  close,
  onSave,
  mortgage,
  offer,
}) => {
  const { t } = useTranslation('mortgages');
  const {
    draft,
    setValue,
    setStartDate,
    setTermMonths,
    setEuribor,
    addSwitchingCost,
    addMonthlyCost,
    addCashbackCampaign,
    updateRow,
    removeRow,
    visibleErrors,
    isValid,
    markSubmitted,
    hasUnsavedChanges,
    toOffer,
  } = useOfferForm({ mortgage, offer, opened });

  const handleSave = () => {
    markSubmitted();
    if (!isValid) {
      return;
    }
    onSave(toOffer());
    close();
  };

  const guard = useDiscardGuard({
    hasUnsavedChanges: () => hasUnsavedChanges(),
    onDiscard: close,
  });

  const required = t('required', { ns: 'common' });
  const hasVariablePart = draft.rateKind !== 'fixed';
  const hasFixedPart = draft.rateKind !== 'variable';

  return (
    <Modal
      centered
      size="lg"
      opened={opened}
      onClose={guard.requestClose}
      closeOnEscape={!guard.isConfirming}
      title={offer ? t('offers.editTitle') : t('offers.addTitle')}
    >
      <Stack gap="md">
        <TextInput
          label={t('offers.bankName')}
          required
          value={draft.bankName}
          error={visibleErrors.bankName ? required : undefined}
          onChange={(event) => setValue('bankName', event.currentTarget.value)}
        />

        <Group grow align="flex-start">
          <MonthPickerInput
            label={t('offers.startDate')}
            description={t('offers.startDateHint')}
            required
            value={draft.startDate}
            error={
              visibleErrors.startDate
                ? t(`offers.startDateError.${visibleErrors.startDate}`)
                : undefined
            }
            onChange={setStartDate}
          />
          <NumberInput
            label={t('offers.termMonths')}
            description={t('offers.termMonthsHint')}
            required
            allowDecimal={false}
            value={draft.termMonths}
            error={visibleErrors.termMonths ? required : undefined}
            onChange={setTermMonths}
          />
        </Group>

        <Stack gap={6}>
          <Text size="sm" fw={600}>
            {t('offers.rate')}
          </Text>
          <SegmentedControl
            aria-label={t('offers.rate')}
            value={draft.rateKind}
            onChange={(value) => setValue('rateKind', value as RateKind)}
            data={[
              { value: 'variable', label: t('offers.variable') },
              { value: 'fixed', label: t('offers.fixed') },
              { value: 'mixed', label: t('offers.mixed') },
            ]}
          />
          <Group grow align="flex-start">
            {hasFixedPart && (
              <NumberInput
                label={t('offers.fixedTan')}
                decimalScale={3}
                value={draft.fixedTan}
                onChange={(value) => setValue('fixedTan', value)}
              />
            )}
            {draft.rateKind === 'mixed' && (
              <NumberInput
                label={t('offers.fixedMonths')}
                allowDecimal={false}
                value={draft.fixedMonths}
                onChange={(value) => setValue('fixedMonths', value)}
              />
            )}
          </Group>
          {hasVariablePart && (
            <Group grow align="flex-start">
              <NumberInput
                label={t('rates.euribor')}
                decimalScale={3}
                value={draft.euribor}
                onChange={setEuribor}
              />
              <NumberInput
                label={t('rates.spread')}
                decimalScale={3}
                value={draft.spread}
                onChange={(value) => setValue('spread', value)}
              />
            </Group>
          )}
          {visibleErrors.rate && (
            <Text size="xs" c="red">
              {t('offers.rateError')}
            </Text>
          )}
        </Stack>

        <Group grow align="flex-start">
          <NumberInput
            label={t('offers.exitFeePercent')}
            description={t('offers.exitFeeHint')}
            decimalScale={3}
            suffix=" %"
            value={draft.exitFeePercent}
            error={visibleErrors.exitFeePercent ? t('simulator.feeError') : undefined}
            onChange={(value) => setValue('exitFeePercent', value)}
          />
          <NumberInput
            label={t('offers.cashBonus')}
            description={t('offers.cashBonusHint')}
            decimalScale={2}
            thousandSeparator
            suffix=" €"
            value={draft.cashBonus}
            error={visibleErrors.cashBonus ? required : undefined}
            onChange={(value) => setValue('cashBonus', value)}
          />
          <NumberInput
            label={t('offers.refundedInstalments')}
            description={t('offers.refundedInstalmentsHint')}
            allowDecimal={false}
            value={draft.refundedInstalments}
            error={visibleErrors.refundedInstalments ? t('offers.refundedError') : undefined}
            onChange={(value) => setValue('refundedInstalments', value)}
          />
        </Group>

        <CostRows
          title={t('offers.switchingCosts')}
          hint={t('offers.switchingCostsHint')}
          addLabel={t('costs.add')}
          error={visibleErrors.switchingCosts ? t('costs.error') : undefined}
          onAdd={addSwitchingCost}
          rows={draft.switchingCosts}
          onChange={(id, changes) => updateRow('switchingCosts', id, changes)}
          onRemove={(id) => removeRow('switchingCosts', id)}
        />
        <MonthlyCostRows
          title={t('monthlyCosts.title')}
          hint={t('offers.monthlyCostsHint')}
          addLabel={t('monthlyCosts.add')}
          error={visibleErrors.monthlyCosts ? t('monthlyCosts.error') : undefined}
          onAdd={addMonthlyCost}
          rows={draft.monthlyCosts}
          onChange={(id, changes) => updateRow('monthlyCosts', id, changes)}
          onRemove={(id) => removeRow('monthlyCosts', id)}
        />
        <CampaignRows
          title={t('cashback.title')}
          hint={t('offers.cashbackHint')}
          addLabel={t('cashback.add')}
          error={visibleErrors.cashbackCampaigns ? t('cashback.error') : undefined}
          onAdd={addCashbackCampaign}
          rows={draft.cashbackCampaigns}
          onChange={(id, changes) => updateRow('cashbackCampaigns', id, changes)}
          onRemove={(id) => removeRow('cashbackCampaigns', id)}
        />

        <Group justify="flex-end">
          <Button variant="outline" onClick={close}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button onClick={handleSave}>{t('save', { ns: 'common' })}</Button>
        </Group>
      </Stack>
      {guard.confirmation}
    </Modal>
  );
};
