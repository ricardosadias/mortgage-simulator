import type { SupportedLocale } from '@/interfaces/Settings';

// Accepts a string because that is how a price is stored (Expense.price is a string), so
// every caller would otherwise repeat the same Number() coercion. A value that isn't a
// number formats as a dash rather than "€NaN".
// Building an Intl.NumberFormat costs ~50x more than formatting with one, and a 240-row loan
// schedule formats over a thousand amounts per render — so one formatter per locale is kept.
const formatters = new Map<SupportedLocale, Intl.NumberFormat>();

const formatterFor = (locale: SupportedLocale): Intl.NumberFormat => {
  const cached = formatters.get(locale);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
  formatters.set(locale, formatter);
  return formatter;
};

export const formatCurrency = (amount: number | string, locale: SupportedLocale): string => {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    return '—';
  }

  return formatterFor(locale).format(value);
};
