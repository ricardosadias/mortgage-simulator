import { ActionIcon, Button, Group, Select } from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { BankOffer } from '@/interfaces/Mortgage';

/** The value that stands for "no offer": the loan as it is, at the current bank. */
export const CURRENT_BANK = 'current';

interface OfferPickerProps {
  offers: BankOffer[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (offer: BankOffer) => void;
  onDelete: (id: string) => void;
}

export const OfferPicker: React.FC<OfferPickerProps> = ({
  offers,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation('mortgages');
  const selected = offers.find((offer) => offer.id === selectedId);

  return (
    <Group gap="xs" align="flex-end" wrap="wrap">
      {/* The selector and the actions on its offer stay on one line; only Add offer may wrap. */}
      <Group gap="xs" align="flex-end" wrap="nowrap" flex={1} miw={260} maw={420}>
        <Select
          label={t('offers.compareWith')}
          value={selected ? selected.id : CURRENT_BANK}
          onChange={(value) => onSelect(value ?? CURRENT_BANK)}
          allowDeselect={false}
          data={[
            { value: CURRENT_BANK, label: t('offers.currentBank') },
            ...offers.map((offer) => ({ value: offer.id, label: offer.bankName })),
          ]}
          flex={1}
          miw={0}
        />
        {selected && (
          <>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={`${t('offers.edit')} ${selected.bankName}`}
              onClick={() => onEdit(selected)}
            >
              <IconPencil size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size="lg"
              aria-label={`${t('offers.delete')} ${selected.bankName}`}
              onClick={() => onDelete(selected.id)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </>
        )}
      </Group>
      <Button variant="light" leftSection={<IconPlus size={14} />} onClick={onAdd}>
        {t('offers.add')}
      </Button>
    </Group>
  );
};
