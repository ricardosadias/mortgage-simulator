import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { Mortgage } from '@/interfaces/Mortgage';
import { useMortgagesActions, useMortgagesStore } from '@/store/mortgages';
import { parseMortgages } from '@/utils/parseMortgages';
import { NOTIFICATION_ERROR, NOTIFICATION_SUCCESS } from '@/constants/colors';
import styles from '../styles/Notification.module.css';

const downloadJson = (fileName: string, data: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const today = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * Export and import of every loan as a JSON file — the only backup, since the loans live in
 * this browser alone. An import replaces all loans; when that would discard existing ones it
 * waits in `pendingImport` until `confirmImport` or `cancelImport`.
 */
export const useMortgageBackup = () => {
  const { t } = useTranslation('mortgages');
  const { replaceMortgagesAction } = useMortgagesActions();
  const [pendingImport, setPendingImport] = useState<Mortgage[] | undefined>(undefined);

  const exportFile = () =>
    downloadJson(`mortgages-${today()}.json`, useMortgagesStore.getState().mortgages);

  const applyImport = (mortgages: Mortgage[]) => {
    replaceMortgagesAction(mortgages);
    setPendingImport(undefined);
    notifications.show({
      message: t('backup.imported', { count: mortgages.length }),
      color: NOTIFICATION_SUCCESS,
      classNames: styles,
    });
  };

  const importFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    const parsed = parseMortgages(await file.text());
    if (!parsed.ok) {
      notifications.show({
        title: t('backup.invalidTitle'),
        message: parsed.error,
        color: NOTIFICATION_ERROR,
        classNames: styles,
      });
      return;
    }
    if (useMortgagesStore.getState().mortgages.length === 0) {
      applyImport(parsed.mortgages);
      return;
    }
    setPendingImport(parsed.mortgages);
  };

  const confirmImport = () => {
    if (pendingImport) {
      applyImport(pendingImport);
    }
  };

  const cancelImport = () => setPendingImport(undefined);

  return { exportFile, importFile, pendingImport, confirmImport, cancelImport };
};
