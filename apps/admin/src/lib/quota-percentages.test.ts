import { describe, expect, it } from 'vitest';
import { calculateQuotaPercentages } from './quota-percentages';

describe('calculateQuotaPercentages', () => {
  it.each([
    [0, 2_000, { usedPercent: 0, remainingPercent: 100, paintedPercent: 0 }],
    [2_000, 2_000, { usedPercent: 100, remainingPercent: 0, paintedPercent: 100 }],
    [2_500, 2_000, { usedPercent: 125, remainingPercent: 0, paintedPercent: 100 }],
  ] as const)(
    'calculates zero, full, and over-reference values for %s of %s',
    (used, allowance, expected) => {
      expect(calculateQuotaPercentages(used, allowance)).toEqual(expected);
    },
  );

  it('rounds used and remaining independently from their raw values', () => {
    expect(calculateQuotaPercentages(667, 2_000)).toEqual({
      usedPercent: 33.4,
      remainingPercent: 66.7,
      paintedPercent: 33.4,
    });
  });

  it.each([
    ['NaN used', Number.NaN, 100],
    ['infinite used', Number.POSITIVE_INFINITY, 100],
    ['negative used', -1, 100],
    ['fractional used', 1.5, 100],
    ['unsafe used', Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER],
    ['zero allowance', 1, 0],
    ['negative allowance', 1, -100],
    ['infinite allowance', 1, Number.POSITIVE_INFINITY],
    ['fractional allowance', 1, 100.5],
    ['unsafe allowance', 1, Number.MAX_SAFE_INTEGER + 1],
  ] as const)('rejects %s', (_caseName, used, allowance) => {
    expect(calculateQuotaPercentages(used, allowance)).toBeNull();
  });
});
