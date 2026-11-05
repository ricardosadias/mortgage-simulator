import { Group, SegmentedControl, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/hooks/useLocale';
import { BackupControls } from './BackupControls';

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = useLocale();

  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Title order={2}>{t('appName')}</Title>
      <Group gap="sm">
        <BackupControls />
        <SegmentedControl
          aria-label={t('language')}
          value={locale}
          onChange={(language) => void i18n.changeLanguage(language)}
          data={[
            { value: 'en', label: 'EN' },
            { value: 'pt-PT', label: 'PT' },
          ]}
        />
      </Group>
    </Group>
  );
};
