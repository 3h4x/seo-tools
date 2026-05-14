const GA4_PROPERTY_PREFIX = 'properties/';

export function normalizeGa4PropertyId(propertyId) {
  const trimmed = propertyId?.trim();
  if (!trimmed) return undefined;

  return trimmed.startsWith(GA4_PROPERTY_PREFIX)
    ? trimmed
    : `${GA4_PROPERTY_PREFIX}${trimmed}`;
}
