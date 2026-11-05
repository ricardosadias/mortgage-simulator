import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { render } from '@testing-library/react';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import common from '../locales/en/common.json';
import mortgages from '../locales/en/mortgages.json';

const i18nTest = i18n.createInstance();
i18nTest.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { common, mortgages },
  },
  interpolation: { escapeValue: false },
} as any);

interface Props {
  children: React.ReactNode;
}

// env="test" skips the transitions and the floating-ui "is my target still on screen?" check.
// jsdom reports every element as zero-sized, so without it Mantine hides every popover dropdown
// with display:none and nothing inside one is reachable by role.
export const TestWrapper: React.FC<Props> = ({ children }) => (
  <I18nextProvider i18n={i18nTest}>
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'en' }}>{children}</DatesProvider>
    </MantineProvider>
  </I18nextProvider>
);

export const renderWithMantineProvider = (ui: React.ReactElement, options?: any) =>
  render(ui, { wrapper: TestWrapper, ...options });
