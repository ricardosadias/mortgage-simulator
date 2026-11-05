import {
  ActionIcon,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { PrepaymentEffect } from '@/utils/mortgage';
import {
  hasInvalidFee,
  isPastMonth,
  type useMortgageSimulation,
} from '@/hooks/useMortgageSimulation';

interface SimulatorProps {
  simulator: ReturnType<typeof useMortgageSimulation>;
}

export const Simulator: React.FC<SimulatorProps> = ({ simulator }) => {
  const { t } = useTranslation('mortgages');
  const { repayments, addRepayment, updateRepayment, removeRepayment, clear } = simulator;

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={5}>{t('simulator.title')}</Title>
            <Text size="xs" c="dimmed">
              {t('simulator.hint')}
            </Text>
            <Text size="xs" c="dimmed">
              {t('simulator.feeHint')}
            </Text>
          </Stack>
          {repayments.length > 0 && (
            <Button variant="subtle" size="compact-sm" color="gray" onClick={clear}>
              {t('simulator.clear')}
            </Button>
          )}
        </Group>

        {repayments.map((repayment) => (
          <Group key={repayment.id} gap="xs" align="flex-end" wrap="wrap">
            <MonthPickerInput
              label={t('simulator.month')}
              value={repayment.date}
              error={isPastMonth(repayment) ? t('simulator.pastMonth') : undefined}
              onChange={(value) => updateRepayment(repayment.id, { date: value })}
              miw={140}
              flex={1}
            />
            <NumberInput
              label={t('simulator.amount')}
              decimalScale={2}
              thousandSeparator
              suffix=" €"
              value={repayment.amount}
              onChange={(value) => updateRepayment(repayment.id, { amount: value })}
              miw={140}
              flex={1}
            />
            <NumberInput
              label={t('simulator.fee')}
              decimalScale={3}
              suffix=" %"
              value={repayment.feePercent}
              error={
                hasInvalidFee(repayment) && repayment.date !== null
                  ? t('simulator.feeError')
                  : undefined
              }
              onChange={(value) => updateRepayment(repayment.id, { feePercent: value })}
              w={120}
            />
            <SegmentedControl
              aria-label={t('simulator.effect')}
              value={repayment.effect}
              onChange={(value) =>
                updateRepayment(repayment.id, { effect: value as PrepaymentEffect })
              }
              data={[
                { value: 'lowerInstalment', label: t('simulator.lowerInstalment') },
                { value: 'shorterTerm', label: t('simulator.shorterTerm') },
              ]}
            />
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={`${t('delete')} ${t('simulator.month')}`}
              onClick={() => removeRepayment(repayment.id)}
              mb={4}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}

        <Button
          variant="light"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          onClick={addRepayment}
          w="fit-content"
        >
          {t('simulator.add')}
        </Button>
      </Stack>
    </Card>
  );
};
