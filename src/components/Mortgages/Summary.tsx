import { Badge, Card, Group, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  monthlyCostCharged,
  type MortgageSummary,
  type OfferEffect,
  type ScenarioEffect,
} from '@/utils/mortgage';
import type { SupportedLocale } from '@/interfaces/Settings';
import type { MonthlyCost } from '@/interfaces/Mortgage';
import { formatCurrency } from '@/utils/currency';
import { formatHouseholdMonth } from '@/utils/householdDay';

/** The real loan and what the simulation changes, present together or not at all. */
export interface SummaryComparison {
  baseline: MortgageSummary;
  effect: ScenarioEffect;
}

interface SummaryProps {
  /** The loan as shown — under the scenario, while one is set. */
  summary: MortgageSummary;
  comparison?: SummaryComparison;
  /** The monthly costs of the bank the monthly figures describe. */
  monthlyCosts: MonthlyCost[];
  locale: SupportedLocale;
}

interface Change {
  label: string;
  isFavourable: boolean;
}

interface TileProps {
  label: string;
  value: string;
  detail?: string;
  hint?: string;
  /** A figure that qualifies the value and must not be missed, shown just under it. */
  highlight?: string;
  /** How a simulation moves the value against the current plan. */
  change?: Change;
  /** How a simulation moves the highlighted figure, which can move differently from the value. */
  highlightChange?: Change;
}

const ChangeBadge: React.FC<{ change: Change }> = ({ change }) => (
  <Badge color={change.isFavourable ? 'teal' : 'red'} variant="light" size="md" tt="none">
    {change.label}
  </Badge>
);

const Tile: React.FC<TileProps> = ({
  label,
  value,
  detail,
  hint,
  highlight,
  change,
  highlightChange,
}) => (
  <Card withBorder padding="md" radius="md">
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {hint ? (
          <Tooltip label={hint} multiline w={240} withArrow>
            <span>{label}</span>
          </Tooltip>
        ) : (
          label
        )}
      </Text>
      {/* Each figure carries its own comparison on its line, so it is clear which it describes. */}
      <Group gap="xs" align="center">
        <Text size="xl" fw={700}>
          {value}
        </Text>
        {change && <ChangeBadge change={change} />}
      </Group>
      {highlight && (
        <Group gap="xs" align="center">
          <Text size="md" fw={700} c="teal">
            {highlight}
          </Text>
          {highlightChange && <ChangeBadge change={highlightChange} />}
        </Group>
      )}
      {detail && (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      )}
    </Stack>
  </Card>
);

interface BreakdownLineProps {
  label: string;
  amount: string;
  isCounted?: boolean;
  notCountedLabel?: string;
}

const BreakdownLine: React.FC<BreakdownLineProps> = ({
  label,
  amount,
  isCounted = true,
  notCountedLabel,
}) => (
  <Group justify="space-between" gap="xs" wrap="nowrap">
    <Text
      size="xs"
      c={isCounted ? undefined : 'dimmed'}
      td={isCounted ? undefined : 'line-through'}
    >
      {label}
      {!isCounted && notCountedLabel ? ` (${notCountedLabel})` : ''}
    </Text>
    <Text size="xs" c={isCounted ? undefined : 'dimmed'}>
      {amount}
    </Text>
  </Group>
);

const shortMonth = (instant: number, locale: SupportedLocale) =>
  formatHouseholdMonth(instant, locale, { month: 'short', year: 'numeric' });

export const Summary: React.FC<SummaryProps> = ({ summary, comparison, monthlyCosts, locale }) => {
  const { t } = useTranslation('mortgages');
  const money = (amount: number) => formatCurrency(amount, locale);

  // Below half a cent a "change" is float noise, not something the simulation did.
  const changeOf = (amount: number, favourable: 'lower' | 'higher'): Change | undefined => {
    if (!comparison || Math.abs(amount) < 0.005) {
      return undefined;
    }
    const sign = amount < 0 ? '−' : '+';
    return {
      label: t('summary.vsCurrent', { amount: `${sign}${money(Math.abs(amount))}` }),
      isFavourable: favourable === 'lower' ? amount < 0 : amount > 0,
    };
  };

  // A change in a future month cannot touch the next instalment or today's balance, so under a
  // scenario the monthly figures describe the first instalment the scenario changes.
  const after = comparison?.effect.firstChange;
  const afterLabel = after ? t('summary.fromMonth', { date: shortMonth(after.date, locale) }) : '';
  const instalment = after ? after.instalment : summary.currentPayment;
  const cashback = after ? after.cashback : summary.currentCashback;
  const netInstalment = instalment - cashback;
  // Either side earning cashback makes the net instalment the figure that compares honestly:
  // leaving a running campaign can raise it even when the gross instalment falls.
  const hasCashbackOnEitherSide =
    cashback > 0 || (after !== undefined && after.baselineCashback > 0);
  const monthlyTotal =
    netInstalment + (after ? after.monthlyCosts : summary.includedMonthlyCostsTotal);
  const monthlyTotalChange = after
    ? changeOf(
        monthlyTotal -
          (after.baselineInstalment - after.baselineCashback + after.baselineMonthlyCosts),
        'lower'
      )
    : undefined;
  const totalCost = comparison ? comparison.effect.totalCost.scenario : summary.projectedTotalCost;

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
      {comparison && <SavingsTile effect={comparison.effect} locale={locale} />}
      <Tile
        label={t('summary.monthlyPayment')}
        value={money(instalment)}
        change={after ? changeOf(after.instalment - after.baselineInstalment, 'lower') : undefined}
        detail={
          after
            ? afterLabel
            : `${t('summary.split', {
                interest: money(summary.currentInterest),
                principal: money(summary.currentPrincipal),
              })} · ${t('summary.rate', { rate: summary.currentRate.toFixed(3) })}`
        }
        highlight={
          hasCashbackOnEitherSide ? t('summary.net', { amount: money(netInstalment) }) : undefined
        }
        highlightChange={
          after && hasCashbackOnEitherSide
            ? changeOf(netInstalment - (after.baselineInstalment - after.baselineCashback), 'lower')
            : undefined
        }
      />
      {monthlyCosts.length > 0 && (
        <Card withBorder padding="md" radius="md">
          <Stack gap={4}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              {t('summary.monthlyTotal')}
            </Text>
            <Group gap="xs" align="center">
              <Text size="xl" fw={700}>
                {money(monthlyTotal)}
              </Text>
              {monthlyTotalChange && <ChangeBadge change={monthlyTotalChange} />}
            </Group>
            <BreakdownLine label={t('summary.monthlyTotalInstalment')} amount={money(instalment)} />
            {cashback > 0 && (
              <BreakdownLine
                label={t('summary.monthlyTotalCashback')}
                amount={`− ${money(cashback)}`}
              />
            )}
            {monthlyCosts.map((cost) => (
              <BreakdownLine
                key={cost.id}
                label={
                  cost.isSubjectToStampDuty
                    ? `${cost.name} ${t('summary.withStampDuty')}`
                    : cost.name
                }
                amount={`+ ${money(monthlyCostCharged(cost))}`}
                isCounted={cost.isIncludedInMonthlyTotal}
                notCountedLabel={t('summary.notCounted')}
              />
            ))}
          </Stack>
        </Card>
      )}
      <Tile
        label={t('summary.balance')}
        value={money(after ? after.balance : summary.balance)}
        change={after ? changeOf(after.balance - after.baselineBalance, 'lower') : undefined}
        detail={
          after
            ? afterLabel
            : t('summary.progress', {
                made: summary.paymentsMade,
                total: summary.paymentsMade + summary.paymentsRemaining,
              })
        }
      />
      <Tile
        label={t('summary.paid')}
        value={money(summary.totalPaid)}
        detail={`${t('summary.paidSplit', {
          principal: money(summary.principalPaid),
          interest: money(summary.interestPaid),
        })}${
          summary.prepaidTotal > 0
            ? ` · ${t('summary.prepaid', { amount: money(summary.prepaidTotal) })}`
            : ''
        }${
          summary.prepaymentFeesPaid > 0
            ? ` · ${t('summary.prepaymentFees', { amount: money(summary.prepaymentFeesPaid) })}`
            : ''
        }`}
      />
      <Tile
        label={t('summary.totalInterest')}
        value={money(summary.projectedTotalInterest)}
        change={
          comparison
            ? changeOf(
                summary.projectedTotalInterest - comparison.baseline.projectedTotalInterest,
                'lower'
              )
            : undefined
        }
      />
      <Tile label={t('summary.upfrontCosts')} value={money(summary.initialCostsTotal)} />
      {summary.cashbackEndDate !== undefined && (
        <Tile
          label={t('summary.cashback')}
          value={money(summary.projectedCashback)}
          change={
            comparison
              ? changeOf(
                  summary.projectedCashback - comparison.baseline.projectedCashback,
                  'higher'
                )
              : undefined
          }
          detail={t('summary.cashbackDetail', {
            received: money(summary.cashbackReceived),
            date: shortMonth(summary.cashbackEndDate, locale),
          })}
        />
      )}
      <Tile
        label={t('summary.totalCost')}
        value={money(totalCost)}
        hint={t(comparison?.effect.offer ? 'summary.totalCostHintOffer' : 'summary.totalCostHint')}
        change={
          comparison
            ? changeOf(totalCost - comparison.effect.totalCost.baseline, 'lower')
            : undefined
        }
        detail={
          summary.payoffDate === undefined
            ? undefined
            : t('summary.payoff', { date: shortMonth(summary.payoffDate, locale) })
        }
      />
    </SimpleGrid>
  );
};

interface SavingsTileProps {
  effect: ScenarioEffect;
  locale: SupportedLocale;
}

const SavingsTile: React.FC<SavingsTileProps> = ({ effect, locale }) => {
  const { t } = useTranslation('mortgages');
  const money = (amount: number) => formatCurrency(amount, locale);

  return (
    <Card withBorder padding="md" radius="md" bg="var(--mantine-color-teal-light)">
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {effect.offer
            ? t('summary.savingsWithBank', { bank: effect.offer.bankName })
            : t('summary.savings')}
        </Text>
        <Text size="xl" fw={700} c={effect.netSaving < 0 ? 'red' : undefined}>
          {money(effect.netSaving)}
        </Text>
        <BreakdownLine
          label={t('summary.savingsInterest')}
          amount={`+ ${money(effect.interestSaved)}`}
        />
        {effect.cashbackLost > 0.005 && (
          <BreakdownLine
            label={t('summary.savingsCashback')}
            amount={`− ${money(effect.cashbackLost)}`}
          />
        )}
        {effect.feesPaid > 0.005 && (
          <BreakdownLine label={t('summary.savingsFee')} amount={`− ${money(effect.feesPaid)}`} />
        )}
        {effect.offer && <OfferLines offer={effect.offer} locale={locale} />}
        {effect.payoffDate !== undefined && (
          <Text size="xs" c="dimmed">
            {effect.instalmentsSaved > 0
              ? t('summary.savingsInstalments', {
                  count: effect.instalmentsSaved,
                  date: shortMonth(effect.payoffDate, locale),
                })
              : t('summary.savingsSameTerm', { date: shortMonth(effect.payoffDate, locale) })}
          </Text>
        )}
      </Stack>
    </Card>
  );
};

const OfferLines: React.FC<{ offer: OfferEffect; locale: SupportedLocale }> = ({
  offer,
  locale,
}) => {
  const { t } = useTranslation('mortgages');
  const money = (amount: number) => formatCurrency(amount, locale);
  const signed = (amount: number) => `${amount < 0 ? '−' : '+'} ${money(Math.abs(amount))}`;
  // Lines that are zero say nothing about this offer, so they are left out.
  const lines = [
    { key: 'switching', label: t('summary.offerSwitchingCosts'), amount: -offer.switchingCosts },
    { key: 'exitFee', label: t('summary.offerExitFee'), amount: -offer.exitFee },
    { key: 'cashBonus', label: t('summary.offerCashBonus'), amount: offer.cashBonus },
    {
      key: 'refunded',
      label: t('summary.offerRefundedInstalments'),
      amount: offer.refundedInstalments,
    },
    {
      key: 'monthlyCosts',
      label: t('summary.offerMonthlyCosts'),
      amount: -offer.monthlyCostsDifference,
    },
  ].filter((line) => Math.abs(line.amount) >= 0.005);

  return (
    <>
      {lines.map((line) => (
        <BreakdownLine key={line.key} label={line.label} amount={signed(line.amount)} />
      ))}
    </>
  );
};
