import { useState } from 'react';
import { Accordion, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { Mortgage } from '@/interfaces/Mortgage';
import { useMortgagesActions, useMortgagesStore } from '@/store/mortgages';
import { useLocale } from '@/hooks/useLocale';
import { NOTIFICATION_SUCCESS } from '@/constants/colors';
import { MortgageModal } from '../Modals/Mortgages/MortgageModal';
import { MortgageCard } from './MortgageCard';
import styles from '../../styles/Notification.module.css';

export const Mortgages: React.FC = () => {
  const locale = useLocale();
  const { t } = useTranslation('mortgages');
  const mortgages = useMortgagesStore((state) => state.mortgages);
  const { addMortgageAction, updateMortgageAction, removeMortgageAction } = useMortgagesActions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Mortgage | undefined>(undefined);

  const openCreate = () => {
    setEditing(undefined);
    setIsModalOpen(true);
  };

  const openEdit = (mortgage: Mortgage) => {
    setEditing(mortgage);
    setIsModalOpen(true);
  };

  const save = (mortgage: Mortgage) => {
    if (editing) {
      updateMortgageAction(mortgage);
      return;
    }
    addMortgageAction(mortgage);
  };

  const remove = (id: string) => {
    removeMortgageAction(id);
    notifications.show({
      message: t('deleted'),
      color: NOTIFICATION_SUCCESS,
      classNames: styles,
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>{t('menu.Mortgages', { ns: 'common' })}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          {t('addLoan')}
        </Button>
      </Group>

      {mortgages.length === 0 ? (
        <Card withBorder padding="lg" radius="md">
          <Stack gap={4}>
            <Text fw={600}>{t('empty')}</Text>
            <Text size="sm" c="dimmed">
              {t('emptyHint')}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Accordion variant="separated" multiple defaultValue={mortgages.map(({ id }) => id)}>
          {mortgages.map((mortgage) => (
            <MortgageCard
              key={mortgage.id}
              mortgage={mortgage}
              locale={locale}
              onEdit={openEdit}
              onDelete={remove}
              onUpdate={updateMortgageAction}
            />
          ))}
        </Accordion>
      )}

      <MortgageModal
        opened={isModalOpen}
        close={() => setIsModalOpen(false)}
        onSave={save}
        mortgage={editing}
      />
    </Stack>
  );
};
