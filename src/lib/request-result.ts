type MutationPayload = {
  ok?: boolean;
  error?: string;
};

export type MutationResult = {
  ok: boolean;
  error?: string;
};

export function formatNetworkError(error: unknown, fallback = 'Network error — could not reach the server'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

const CONFIG_ERROR_MESSAGES: Record<string, string> = {
  failed_to_load_config_source: 'Could not load config source. Check server logs.',
  failed_to_save_config: 'Could not save config. Check server logs.',
  failed_to_delete_config: 'Could not remove config. Check server logs.',
};

export function formatConfigMutationError(error: string | undefined, fallback: string): string {
  const trimmed = error?.trim();
  if (!trimmed) return fallback;
  return CONFIG_ERROR_MESSAGES[trimmed] ?? trimmed;
}

export async function getMutationResult(response: Response, fallbackError: string): Promise<MutationResult> {
  let payload: MutationPayload | null = null;

  try {
    payload = await response.json() as MutationPayload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.trim() || `Request failed (${response.status})`,
    };
  }

  if (payload?.ok === true) {
    return { ok: true };
  }

  return {
    ok: false,
    error: payload?.error?.trim() || fallbackError,
  };
}
