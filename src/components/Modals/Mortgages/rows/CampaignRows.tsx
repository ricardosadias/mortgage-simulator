import { ActionIcon, Group } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { CampaignDraft } from '@/hooks/mortgageDrafts';
import { RowSection, type RowSectionProps } from './RowSection';

interface CampaignRowsProps extends Omit<RowSectionProps, 'children'> {
  rows: CampaignDraft[];
  onChange: (id: string, changes: Partial<Omit<CampaignDraft, 'id'>>) => void;
  onRemove: (id: string) => void;
}

/** Spread-cashback campaigns: a start and an end month per row, both inclusive. */
export const CampaignRows: React.FC<CampaignRowsProps> = ({
  rows,
  onChange,
  onRemove,
  ...section
}) => {
  const { t } = useTranslation('mortgages');
  return (
    <RowSection {...section}>
      {rows.map((campaign) => (
        <Group key={campaign.id} gap="xs" align="flex-end" wrap="nowrap">
          <MonthPickerInput
            label={t('cashback.start')}
            value={campaign.startDate}
            onChange={(value) => onChange(campaign.id, { startDate: value })}
            flex={1}
          />
          <MonthPickerInput
            label={t('cashback.end')}
            value={campaign.endDate}
            onChange={(value) => onChange(campaign.id, { endDate: value })}
            flex={1}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={`${t('delete')} ${section.title}`}
            onClick={() => onRemove(campaign.id)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
    </RowSection>
  );
};
