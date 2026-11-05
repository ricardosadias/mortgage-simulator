import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  TextInput,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Mortgage, RatePeriod } from '@/interfaces/Mortgage';
import { useMortgageForm } from '@/hooks/useMortgageForm';
import { CampaignRows } from './rows/CampaignRows';
import { CostRows } from './rows/CostRows';
import { MonthlyCostRows } from './rows/MonthlyCostRows';
import { RowSection } from './rows/RowSection';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

interface MortgageModalProps {
  opened: boolean;
  close: () => void;
  onSave: (mortgage: Mortgage) => void;
  mortgage?: Mortgage;
}

export const MortgageModal: React.FC<MortgageModalProps> = ({
  opened,
  close,
  onSave,
  mortgage,
}) => {
  const { t } = useTranslation('mortgages');
  const {
    draft,
    setValue,
    addRatePeriod,
    addPrepayment,
    addInitialCost,
    addCashbackCampaign,
    addMonthlyCost,
    updateRow,
    removeRow,
    visibleErrors,
    isValid,
    markSubmitted,
    hasUnsavedChanges,
    toMortgage,
  } = useMortgageForm({ mortgage, opened });

  const handleSave = () => {
    markSubmitted();
    if (!isValid) {
      return;
    }
    onSave(toMortgage());
    close();
  };

  const guard = useDiscardGuard({
    hasUnsavedChanges: () => hasUnsavedChanges(),
    onDiscard: close,
  });

  const required = t('required', { ns: 'common' });

  return (
    <Modal
      centered
      size="lg"
      opened={opened}
      onClose={guard.requestClose}
      closeOnEscape={!guard.isConfirming}
      title={mortgage ? t('editTitle') : t('addTitle')}
    >
      <Stack gap="md">
        <TextInput
          label={t('fields.name')}
          required
          value={draft.name}
          error={visibleErrors.name ? required : undefined}
          onChange={(event) => setValue('name', event.currentTarget.value)}
        />

        <Group grow align="flex-start">
          <NumberInput
            label={t('fields.initialAmount')}
            required
            decimalScale={2}
            thousandSeparator
            suffix=" €"
            value={draft.initialAmount}
            error={visibleErrors.initialAmount ? required : undefined}
            onChange={(value) => setValue('initialAmount', value)}
          />
          <NumberInput
            label={t('fields.termMonths')}
            required
            allowDecimal={false}
            value={draft.termMonths}
            error={visibleErrors.termMonths ? required : undefined}
            onChange={(value) => setValue('termMonths', value)}
          />
        </Group>

        <MonthPickerInput
          label={t('fields.firstPaymentDate')}
          required
          value={draft.firstPaymentDate}
          error={visibleErrors.firstPaymentDate ? required : undefined}
          onChange={(value) =>
            setValue('firstPaymentDate', value === null ? null : new Date(value))
          }
        />

        <RowSection
          title={t('rates.title')}
          hint={t('rates.hint')}
          addLabel={t('rates.add')}
          error={visibleErrors.ratePeriods ? t('rates.error') : undefined}
          onAdd={addRatePeriod}
        >
          {draft.ratePeriods.map((period) => (
            <Group key={period.id} gap="xs" align="flex-end" wrap="wrap">
              <SegmentedControl
                aria-label={t('rates.kind')}
                value={period.kind}
                onChange={(value) =>
                  updateRow('ratePeriods', period.id, { kind: value as RatePeriod['kind'] })
                }
                data={[
                  { value: 'variable', label: t('offers.variable') },
                  { value: 'fixed', label: t('offers.fixed') },
                ]}
              />
              <MonthPickerInput
                label={t('rates.from')}
                value={period.startDate}
                onChange={(value) =>
                  updateRow('ratePeriods', period.id, {
                    startDate: value === null ? null : new Date(value),
                  })
                }
                miw={120}
                flex={1}
              />
              {period.kind === 'fixed' ? (
                <NumberInput
                  label={t('rates.fixedTan')}
                  decimalScale={3}
                  step={0.01}
                  value={period.tan}
                  onChange={(value) => updateRow('ratePeriods', period.id, { tan: value })}
                  miw={120}
                  flex={2}
                />
              ) : (
                <>
                  <NumberInput
                    label={t('rates.euribor')}
                    decimalScale={3}
                    step={0.001}
                    value={period.euribor}
                    onChange={(value) => updateRow('ratePeriods', period.id, { euribor: value })}
                    miw={100}
                    flex={1}
                  />
                  <NumberInput
                    label={t('rates.spread')}
                    decimalScale={3}
                    step={0.01}
                    value={period.spread}
                    onChange={(value) => updateRow('ratePeriods', period.id, { spread: value })}
                    miw={100}
                    flex={1}
                  />
                </>
              )}
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`${t('delete')} ${t('rates.title')}`}
                // The opening rate is the one row a loan cannot do without.
                disabled={draft.ratePeriods.length === 1}
                onClick={() => removeRow('ratePeriods', period.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
        </RowSection>

        <RowSection
          title={t('prepayments.title')}
          hint={t('prepayments.hint')}
          addLabel={t('prepayments.add')}
          error={visibleErrors.prepayments ? t('prepayments.error') : undefined}
          onAdd={addPrepayment}
        >
          {draft.prepayments.map((prepayment) => (
            <Group key={prepayment.id} gap="xs" align="flex-end" wrap="nowrap">
              <MonthPickerInput
                label={t('prepayments.date')}
                value={prepayment.date}
                onChange={(value) =>
                  updateRow('prepayments', prepayment.id, {
                    date: value === null ? null : new Date(value),
                  })
                }
                flex={1}
              />
              <NumberInput
                label={t('prepayments.amount')}
                decimalScale={2}
                thousandSeparator
                suffix=" €"
                value={prepayment.amount}
                onChange={(value) => updateRow('prepayments', prepayment.id, { amount: value })}
                flex={1}
              />
              <NumberInput
                label={t('prepayments.feePercent')}
                decimalScale={3}
                suffix=" %"
                value={prepayment.feePercent}
                onChange={(value) => updateRow('prepayments', prepayment.id, { feePercent: value })}
                flex={1}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`${t('delete')} ${t('prepayments.title')}`}
                onClick={() => removeRow('prepayments', prepayment.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
        </RowSection>

        <CostRows
          title={t('costs.title')}
          hint={t('costs.hint')}
          addLabel={t('costs.add')}
          error={visibleErrors.initialCosts ? t('costs.error') : undefined}
          onAdd={addInitialCost}
          rows={draft.initialCosts}
          onChange={(id, changes) => updateRow('initialCosts', id, changes)}
          onRemove={(id) => removeRow('initialCosts', id)}
        />

        <MonthlyCostRows
          title={t('monthlyCosts.title')}
          hint={t('monthlyCosts.hint')}
          addLabel={t('monthlyCosts.add')}
          error={visibleErrors.monthlyCosts ? t('monthlyCosts.error') : undefined}
          onAdd={addMonthlyCost}
          rows={draft.monthlyCosts}
          onChange={(id, changes) => updateRow('monthlyCosts', id, changes)}
          onRemove={(id) => removeRow('monthlyCosts', id)}
        />

        <CampaignRows
          title={t('cashback.title')}
          hint={t('cashback.hint')}
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
