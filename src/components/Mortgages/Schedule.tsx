import { Fragment, memo } from 'react';
import { AreaChart, BarChart } from '@mantine/charts';
import { Badge, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { aggregateByYear, type ScheduledPayment } from '@/utils/mortgage';
import type { SupportedLocale } from '@/interfaces/Settings';
import { formatCurrency } from '@/utils/currency';
import { formatHouseholdMonth } from '@/utils/householdDay';

interface ScheduleProps {
  schedule: ScheduledPayment[];
  /** The bank the loan moves to, while an offer is compared. */
  newBankName?: string;
  locale: SupportedLocale;
}

// Memoized: the 240-row table and both charts are the costliest part of the page, and they
// depend on nothing but these two props.
export const Schedule = memo(({ schedule, newBankName, locale }: ScheduleProps) => {
  const { t } = useTranslation('mortgages');
  const money = (amount: number) => formatCurrency(amount, locale);
  const lastRate = schedule.at(-1)?.annualRate ?? 0;
  const hasCashback = schedule.some((payment) => payment.cashback > 0);
  const hasSimulation = schedule.some((payment) => payment.simulatedPrepayment > 0);
  // #, month, TAN, instalment, interest, capital, early, balance — plus the optional columns.
  const columnCount = 8 + Number(hasSimulation) + Number(hasCashback);

  const balanceSeries = schedule.map((payment) => ({
    month: formatHouseholdMonth(payment.date, locale),
    [t('schedule.balanceSeries')]: Number(payment.balance.toFixed(2)),
  }));

  const yearlySeries = aggregateByYear(schedule).map((year) => ({
    year: formatHouseholdMonth(year.date, locale),
    [t('schedule.interestSeries')]: Number(year.interest.toFixed(2)),
    [t('schedule.principalSeries')]: Number(year.principal.toFixed(2)),
  }));

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={4}>{t('schedule.title')}</Title>
        <Text size="xs" c="dimmed">
          {t('schedule.caption', { rate: lastRate.toFixed(3) })}
        </Text>
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600}>
          {t('schedule.balanceChart')}
        </Text>
        <AreaChart
          h={220}
          data={balanceSeries}
          dataKey="month"
          series={[{ name: t('schedule.balanceSeries'), color: 'blue.6' }]}
          withDots={false}
          gridAxis="y"
          tickLine="y"
          valueFormatter={money}
        />
      </Stack>

      <Stack gap={4}>
        <Text size="sm" fw={600}>
          {t('schedule.splitChart')}
        </Text>
        <BarChart
          h={220}
          data={yearlySeries}
          dataKey="year"
          type="stacked"
          series={[
            { name: t('schedule.interestSeries'), color: 'orange.6' },
            { name: t('schedule.principalSeries'), color: 'teal.6' },
          ]}
          gridAxis="y"
          tickLine="y"
          withLegend
          legendProps={{ verticalAlign: 'bottom' }}
          valueFormatter={money}
        />
      </Stack>

      <ScrollArea.Autosize mah={420} type="auto">
        {/* Cells never wrap: the table scrolls sideways instead, so a narrow screen keeps one
            line per instalment. */}
        <Table
          stickyHeader
          highlightOnHover
          withTableBorder
          striped
          style={{ whiteSpace: 'nowrap' }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('schedule.number')}</Table.Th>
              <Table.Th>{t('schedule.month')}</Table.Th>
              <Table.Th ta="right">{t('schedule.rate')}</Table.Th>
              <Table.Th ta="right">{t('schedule.payment')}</Table.Th>
              <Table.Th ta="right">{t('schedule.interest')}</Table.Th>
              <Table.Th ta="right">{t('schedule.principal')}</Table.Th>
              <Table.Th ta="right">{t('schedule.prepayment')}</Table.Th>
              {hasSimulation && <Table.Th ta="right">{t('schedule.simulated')}</Table.Th>}
              {hasCashback && <Table.Th ta="right">{t('schedule.cashback')}</Table.Th>}
              <Table.Th ta="right">{t('schedule.balance')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {schedule.map((payment, index) => {
              const isSwitch = payment.isAtNewBank && !schedule[index - 1]?.isAtNewBank;
              return (
                <Fragment key={payment.number}>
                  {isSwitch && newBankName && (
                    // A row of its own rather than a badge in the month cell, which would widen
                    // that column for every row of the table.
                    <Table.Tr bg="var(--mantine-color-blue-light)">
                      <Table.Td colSpan={columnCount}>
                        <Badge size="sm" variant="filled" tt="none">
                          {t('offers.switchRow', { bank: newBankName })}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  <Table.Tr
                    bg={
                      isSwitch
                        ? 'var(--mantine-color-blue-light)'
                        : payment.simulatedPrepayment > 0
                          ? 'var(--mantine-color-teal-light)'
                          : undefined
                    }
                  >
                    <Table.Td>{payment.number}</Table.Td>
                    <Table.Td>{formatHouseholdMonth(payment.date, locale)}</Table.Td>
                    <Table.Td ta="right">{payment.annualRate.toFixed(3)}%</Table.Td>
                    <Table.Td ta="right">{money(payment.payment)}</Table.Td>
                    <Table.Td ta="right">{money(payment.interest)}</Table.Td>
                    <Table.Td ta="right">{money(payment.principal)}</Table.Td>
                    <Table.Td ta="right">
                      {payment.prepayment > 0 ? money(payment.prepayment) : '—'}
                    </Table.Td>
                    {hasSimulation && (
                      <Table.Td ta="right" fw={payment.simulatedPrepayment > 0 ? 700 : undefined}>
                        {payment.simulatedPrepayment > 0 ? money(payment.simulatedPrepayment) : '—'}
                      </Table.Td>
                    )}
                    {hasCashback && (
                      <Table.Td ta="right">
                        {payment.cashback > 0 ? money(payment.cashback) : '—'}
                      </Table.Td>
                    )}
                    <Table.Td ta="right">{money(payment.balance)}</Table.Td>
                  </Table.Tr>
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Stack>
  );
});
