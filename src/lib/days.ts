export type QueryParamValue = string | string[] | null | undefined;

function firstQueryParamValue(value: QueryParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export function parseIntegerParam(value: QueryParamValue, fallback: number): number {
  const candidate = firstQueryParamValue(value) ?? String(fallback);
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
  value: QueryParamValue,
  validValues: readonly number[],
  fallback: number,
): number {
  return normalizeAllowedNumber(parseIntegerParam(value, fallback), validValues, fallback);
}
