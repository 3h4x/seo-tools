export async function loadOrFallback<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(`[${label}]`, error);
    return fallback;
  }
}
