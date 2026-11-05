import { ActionIcon, Group, NumberInput, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { CostDraft } from '@/hooks/mortgageDrafts';
import { RowSection, type RowSectionProps } from './RowSection';

interface CostRowsProps extends Omit<RowSectionProps, 'children'> {
  rows: CostDraft[];
  onChange: (id: string, changes: Partial<Omit<CostDraft, 'id'>>) => void;
  onRemove: (id: string) => void;
}

/** One-off costs: a description and an amount per row. */
export const CostRows: React.FC<CostRowsProps> = ({ rows, onChange, onRemove, ...section }) => {
  const { t } = useTranslation('mortgages');
  return (
    <RowSection {...section}>
      {rows.map((cost) => (
        <Group key={cost.id} gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            label={t('costs.name')}
            value={cost.name}
            onChange={(event) => onChange(cost.id, { name: event.currentTarget.value })}
            flex={2}
          />
          <NumberInput
            label={t('costs.amount')}
            decimalScale={2}
            thousandSeparator
            suffix=" €"
            value={cost.amount}
            onChange={(value) => onChange(cost.id, { amount: value })}
            flex={1}
          />
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
