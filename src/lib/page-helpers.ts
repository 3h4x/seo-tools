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

export function loadSyncOrFallback<T>(
  label: string,
  read: () => T,
  fallback: T,
): T {
  try {
    return read();
  } catch (error) {
    console.error(`[${label}]`, error);
    return fallback;
  }
}

export type FlaggedLoad<T> = { value: T; failed: boolean };

export async function loadOrFlag<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<FlaggedLoad<T>> {
  try {
    return { value: await promise, failed: false };
  } catch (error) {
    console.error(`[${label}]`, error);
    return { value: fallback, failed: true };
  }
}
