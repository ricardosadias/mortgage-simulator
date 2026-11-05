import { Button, FileButton, Group, Modal, Stack, Text } from '@mantine/core';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useMortgageBackup } from '@/hooks/useMortgageBackup';

export const BackupControls: React.FC = () => {
  const { t } = useTranslation('mortgages');
  const { exportFile, importFile, pendingImport, confirmImport, cancelImport } =
    useMortgageBackup();

  return (
    <>
      <Group gap="xs">
        <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportFile}>
          {t('backup.export')}
        </Button>
        <FileButton onChange={(file) => void importFile(file)} accept="application/json,.json">
          {(props) => (
            <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
              {t('backup.import')}
            </Button>
          )}
        </FileButton>
      </Group>

      <Modal
        opened={pendingImport !== undefined}
        onClose={cancelImport}
        title={t('backup.confirmTitle')}
        centered
        size="sm"
      >
        <Stack>
          <Text>{t('backup.confirmMessage', { count: pendingImport?.length ?? 0 })}</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={cancelImport}>
              {t('cancel', { ns: 'common' })}
            </Button>
            <Button color="red" onClick={confirmImport}>
              {t('backup.confirmReplace')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
