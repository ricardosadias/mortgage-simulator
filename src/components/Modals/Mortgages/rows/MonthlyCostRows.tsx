import { ActionIcon, Checkbox, Group, NumberInput, Stack, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { MonthlyCostDraft } from '@/hooks/mortgageDrafts';
import { RowSection, type RowSectionProps } from './RowSection';

interface MonthlyCostRowsProps extends Omit<RowSectionProps, 'children'> {
  rows: MonthlyCostDraft[];
  onChange: (id: string, changes: Partial<Omit<MonthlyCostDraft, 'id'>>) => void;
  onRemove: (id: string) => void;
}

/** Recurring costs, each ticked or not to count toward the monthly total and to carry stamp duty. */
export const MonthlyCostRows: React.FC<MonthlyCostRowsProps> = ({
  rows,
  onChange,
  onRemove,
  ...section
}) => {
  const { t } = useTranslation('mortgages');
  return (
    <RowSection {...section}>
      {rows.map((cost) => (
        <Group key={cost.id} gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            label={t('monthlyCosts.name')}
            value={cost.name}
            onChange={(event) => onChange(cost.id, { name: event.currentTarget.value })}
            flex={2}
          />
          <NumberInput
            label={t('monthlyCosts.amount')}
            decimalScale={2}
            thousandSeparator
            suffix=" €"
            value={cost.amount}
            onChange={(value) => onChange(cost.id, { amount: value })}
            flex={1}
          />
          <Stack gap={6} mb={4}>
            <Checkbox
              label={t('monthlyCosts.include')}
              checked={cost.isIncludedInMonthlyTotal}
              onChange={(event) =>
                onChange(cost.id, { isIncludedInMonthlyTotal: event.currentTarget.checked })
              }
            />
            <Checkbox
              label={t('monthlyCosts.stampDuty')}
              checked={cost.isSubjectToStampDuty}
              onChange={(event) =>
                onChange(cost.id, { isSubjectToStampDuty: event.currentTarget.checked })
              }
            />
          </Stack>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={`${t('delete')} ${section.title}`}
            onClick={() => onRemove(cost.id)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
    </RowSection>
  );
};
