import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../currency';

describe('formatCurrency', () => {
  it('formats euros the Portuguese way, with the symbol after the amount', () => {
    // The bug this guards: components hardcoding `€${x.toFixed(2)}` render "€12.50" for a
    // pt-PT user, who should see "12,50 €". Intl separates the amount and the symbol with
    // a non-breaking space (U+00A0), not a plain one.
    expect(formatCurrency(12.5, 'pt-PT')).toBe('12,50 €');
  });

  it('formats euros the English way, with the symbol before the amount', () => {
    expect(formatCurrency(12.5, 'en')).toBe('€12.50');
  });

  it('accepts a price string, which is how expenses store it', () => {
    expect(formatCurrency('12.5', 'en')).toBe('€12.50');
  });

  it('always shows two fraction digits', () => {
    expect(formatCurrency(12, 'en')).toBe('€12.00');
  });

  it('renders a dash rather than NaN for a non-numeric value', () => {
    expect(formatCurrency('not a price', 'en')).toBe('—');
  });

  // Formatters are cached per locale; a cache keyed too coarsely would hand the first locale's
  // formatter to every later one.
  it('keeps each locale its own format when both are used in turn', () => {
    const english = formatCurrency(1234.5, 'en');
    const portuguese = formatCurrency(1234.5, 'pt-PT');

    expect(formatCurrency(1234.5, 'en')).toBe(english);
    expect(portuguese).not.toBe(english);
  });
});
