type WithId = {
  id: string;
};

export type DiscoverySite<T extends WithId> = T & {
  importError?: string;
};

export type ImportResult = {
  id: string;
  ok: boolean;
  error?: string;
};

export type ImportSummary = {
  message: string;
  tone: 'success' | 'warning';
};

type ImportPayload = {
  ok?: boolean;
  error?: string;
};

export async function getImportResult(response: Response): Promise<Omit<ImportResult, 'id'>> {
  let payload: ImportPayload | null = null;

  try {
    payload = await response.json() as ImportPayload;
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
    error: payload?.error?.trim() || 'Save failed',
  };
}

export function applyImportResults<T extends WithId>(
  discovered: DiscoverySite<T>[],
  selectedIds: Set<string>,
  results: ImportResult[],
) {
  const resultsById = new Map(results.map(result => [result.id, result]));
  const remaining: DiscoverySite<T>[] = [];

  for (const site of discovered) {
    if (!selectedIds.has(site.id)) {
      remaining.push(site);
      continue;
    }

    const result = resultsById.get(site.id);
    if (result?.ok) {
      continue;
    }

    remaining.push({
      ...site,
      importError: result?.error || 'Import failed',
    });
  }

  return {
    remaining,
    selected: new Set(remaining.filter(site => selectedIds.has(site.id)).map(site => site.id)),
    successCount: results.filter(result => result.ok).length,
    failureCount: results.filter(result => !result.ok).length,
  };
}

export function buildImportSummary(successCount: number, failureCount: number): ImportSummary | null {
  if (failureCount > 0) {
    return {
      message: successCount > 0
        ? `Imported ${successCount} site${successCount !== 1 ? 's' : ''}. ${failureCount} failed.`
        : `${failureCount} site${failureCount !== 1 ? 's' : ''} failed to import.`,
      tone: 'warning',
    };
  }

  if (successCount > 0) {
    return {
      message: `Imported ${successCount} site${successCount !== 1 ? 's' : ''}.`,
      tone: 'success',
    };
  }

  return null;
}
