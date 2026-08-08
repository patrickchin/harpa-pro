export interface QuotaPercentages {
  usedPercent: number;
  remainingPercent: number;
  paintedPercent: number;
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function isValidCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function calculateQuotaPercentages(
  used: number,
  allowance: number,
): QuotaPercentages | null {
  if (!isValidCount(used) || !isValidCount(allowance) || allowance < 1) return null;

  const rawUsedPercent = (used / allowance) * 100;
  return {
    usedPercent: roundTenths(rawUsedPercent),
    remainingPercent: roundTenths(Math.max(0, 100 - rawUsedPercent)),
    paintedPercent: Math.min(100, roundTenths(rawUsedPercent)),
  };
}
