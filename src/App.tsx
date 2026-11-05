import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/charts/styles.css';
import 'dayjs/locale/pt';
import { Suspense } from 'react';
import { Container, Loader, MantineProvider, Stack } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { theme } from './theme';
import { useLocale } from './hooks/useLocale';
import { Header } from './components/Header/Header';
import { Mortgages } from './components/Mortgages/Mortgages';

const dayjsLocale = { en: 'en', 'pt-PT': 'pt' } as const;

function LocalizedDatesProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return <DatesProvider settings={{ locale: dayjsLocale[locale] }}>{children}</DatesProvider>;
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <MantineProvider theme={theme}>
        <Notifications />
        {/* Translations load lazily; useTranslation suspends until they arrive. */}
        <Suspense fallback={<Loader m="xl" />}>
          <LocalizedDatesProvider>
            <Container size="lg" py="md">
              <Stack gap="lg">
                <Header />
                <Mortgages />
              </Stack>
            </Container>
          </LocalizedDatesProvider>
        </Suspense>
      </MantineProvider>
    </I18nextProvider>
  );
}
