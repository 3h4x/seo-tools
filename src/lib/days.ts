export function parseIntegerParam(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

export function normalizeAllowedNumber(
  value: number,
  validValues: readonly number[],
  fallback: number,
): number {
  return validValues.includes(value) ? value : fallback;
}

export function parseAllowedIntegerParam(
  value: string | null | undefined,
  validValues: readonly number[],
  fallback: number,
): number {
  return normalizeAllowedNumber(parseIntegerParam(value, fallback), validValues, fallback);
}
