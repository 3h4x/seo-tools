export function parseIntegerParam(value: string | null | undefined, fallback: number): number {
  const candidate = value ?? String(fallback);
  if (!/^[+-]?\d+$/.test(candidate.trim())) return Number.NaN;

  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
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
