import type { CheckResult, CheckStatus, SiteAuditResult } from './audit';

type CanonicalMetaTag = SiteAuditResult['metaTags'][number];

interface CanonicalPageStats {
  total: number;
  skipped: number;
  passes: number;
  warns: number;
  missing: number;
  broken: number;
}

export interface CanonicalSummary {
  status: CheckStatus;
  label: string;
  message: string;
  compactLabel: string;
}

const SKIP_PREFIX = 'N/A';

function isSkippedCheck(check: CheckResult): boolean {
  return check.message.startsWith(SKIP_PREFIX);
}

function getCanonicalPageStats(metaTags: CanonicalMetaTag[]): CanonicalPageStats {
  return metaTags.reduce<CanonicalPageStats>((acc, meta) => {
    acc.total++;

    if (isSkippedCheck(meta.canonical)) {
      acc.skipped++;
      return acc;
    }

    if (meta.canonical.status === 'warn') {
      acc.warns++;
      return acc;
    }

    if (meta.canonical.status === 'fail' || meta.canonical.status === 'error') {
      if (meta.canonicalTarget === null) {
        acc.missing++;
      } else {
        acc.broken++;
      }
      return acc;
    }

    acc.passes++;
    return acc;
  }, { total: 0, skipped: 0, passes: 0, warns: 0, missing: 0, broken: 0 });
}

export function summarizeCanonicalChecks(metaTags: CanonicalMetaTag[]): CanonicalSummary {
  const stats = getCanonicalPageStats(metaTags);

  if (stats.total === 0) {
    return {
      status: 'pass',
      label: 'Canonical URL',
      message: 'No pages checked for canonical URLs',
      compactLabel: 'No pages',
    };
  }

  if (stats.missing > 0 && stats.broken > 0) {
    const issues = stats.missing + stats.broken;
    return {
      status: 'fail',
      label: 'Canonical URL',
      message: `${issues} page${issues === 1 ? '' : 's'} have canonical issues (${stats.missing} missing, ${stats.broken} broken targets)`,
      compactLabel: `${issues} issue${issues === 1 ? '' : 's'}`,
    };
  }

  if (stats.missing > 0) {
    return {
      status: 'fail',
      label: 'Canonical URL',
      message: `${stats.missing} page${stats.missing === 1 ? '' : 's'} missing canonical tags`,
      compactLabel: `${stats.missing} issue${stats.missing === 1 ? '' : 's'}`,
    };
  }

  if (stats.broken > 0) {
    return {
      status: 'fail',
      label: 'Canonical URL',
      message: `${stats.broken} page${stats.broken === 1 ? '' : 's'} have failing canonical targets`,
      compactLabel: `${stats.broken} issue${stats.broken === 1 ? '' : 's'}`,
    };
  }

  if (stats.warns > 0) {
    return {
      status: 'warn',
      label: 'Canonical URL',
      message: `${stats.warns} page${stats.warns === 1 ? '' : 's'} have canonical warnings`,
      compactLabel: `${stats.warns} warning${stats.warns === 1 ? '' : 's'}`,
    };
  }

  if (stats.skipped === stats.total) {
    return {
      status: 'pass',
      label: 'Canonical URL',
      message: `${stats.skipped} page${stats.skipped === 1 ? '' : 's'} skipped (N/A)`,
      compactLabel: `${stats.skipped} skipped`,
    };
  }

  if (stats.skipped > 0) {
    return {
      status: 'pass',
      label: 'Canonical URL',
      message: `${stats.passes}/${stats.total} pages have valid self-referential canonicals, ${stats.skipped} skipped`,
      compactLabel: `${stats.passes}/${stats.total} pass, ${stats.skipped} skipped`,
    };
  }

  return {
    status: 'pass',
    label: 'Canonical URL',
    message: `${stats.total}/${stats.total} pages have valid self-referential canonicals`,
    compactLabel: `${stats.total}/${stats.total} pass`,
  };
}

export function getMissingCanonicalPages(metaTags: CanonicalMetaTag[]): CanonicalMetaTag[] {
  return metaTags.filter((meta) => meta.canonical.status === 'fail' && meta.canonicalTarget === null);
}

export function getBrokenCanonicalPages(metaTags: CanonicalMetaTag[]): CanonicalMetaTag[] {
  return metaTags.filter((meta) => meta.canonical.status === 'fail' && meta.canonicalTarget !== null);
}
