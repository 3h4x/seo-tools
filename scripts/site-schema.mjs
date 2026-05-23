export const SEARCH_CONSOLE_MIGRATION_SQL = 'ALTER TABLE sites ADD COLUMN search_console INTEGER NOT NULL DEFAULT 1';

export function ensureSitesSearchConsoleColumn(db) {
  try {
    db.exec(SEARCH_CONSOLE_MIGRATION_SQL);
  } catch {
    // Already applied, or the sites table does not exist yet.
  }
}
