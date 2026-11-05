import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '@/interfaces/Settings';

/** The language the UI is rendering in, which also drives number and date formatting. */
export const useLocale = (): SupportedLocale => {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'pt-PT' ? 'pt-PT' : 'en';
};
