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
