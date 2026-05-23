import { ensureSitesSearchConsoleColumn } from './site-schema.mjs';

export function mapCliSiteRow(row) {
  return {
    id: row.id,
    domain: row.domain,
    scUrl: row.sc_url ?? `sc-domain:${row.domain}`,
    ga4: row.ga4_property_id,
    searchConsole: row.search_console !== 0,
    pages: JSON.parse(row.test_pages || '[]'),
  };
}

export function loadCliSites(db) {
  try {
    ensureSitesSearchConsoleColumn(db);
    return db
      .prepare(
        'SELECT id, domain, sc_url, ga4_property_id, search_console, test_pages FROM sites ORDER BY sort_order ASC, id ASC',
      )
      .all()
      .map(mapCliSiteRow);
  } catch {
    return [];
  }
}
