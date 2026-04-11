import { cachedAuditAllSites } from '@/lib/audit';
import { getManagedSites } from '@/lib/sites';
import { analyzeSiteGaps, type GapSeverity, type GapCategory } from '@/lib/gaps';
import { GapsClient, type SiteGap } from './gaps-client';

export const revalidate = 300;

export default async function GapsPage() {
  const [audits, managedSites] = await Promise.all([cachedAuditAllSites(), getManagedSites()]);

  // Collect all gaps from all sites
  const allSiteGaps: SiteGap[] = [];
  for (const audit of audits) {
    const site = managedSites.find(s => s.id === audit.siteId);
    if (!site) continue;
    const { gaps } = analyzeSiteGaps(audit, site);
    for (const gap of gaps) {
      allSiteGaps.push({ gap, siteId: site.id, siteName: site.name, domain: site.domain });
    }
  }

  // Sort: high → medium → low, then by category, then by title
  const severityOrder: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 };
  allSiteGaps.sort((a, b) => {
    const sev = severityOrder[a.gap.severity] - severityOrder[b.gap.severity];
    if (sev !== 0) return sev;
    const cat = a.gap.category.localeCompare(b.gap.category);
    if (cat !== 0) return cat;
    return a.gap.title.localeCompare(b.gap.title);
  });

  const totalGaps = allSiteGaps.length;

  // Build site list (only sites that have gaps)
  const siteIds = [...new Set(allSiteGaps.map(sg => sg.siteId))];
  const sites = siteIds
    .map(id => {
      const site = managedSites.find(s => s.id === id);
      return site ? { id: site.id, name: site.name, domain: site.domain } : null;
    })
    .filter((s): s is { id: string; name: string; domain: string } => s !== null);

  // Build category list (only categories present in current gaps)
  const categories = [...new Set(allSiteGaps.map(sg => sg.gap.category))] as GapCategory[];
  // Sort categories consistently
  const categoryOrder: GapCategory[] = ['crawlability', 'content', 'social', 'indexing', 'structured-data', 'performance', 'security'];
  categories.sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));

  const totalHigh   = allSiteGaps.filter(sg => sg.gap.severity === 'high').length;
  const totalMedium = allSiteGaps.filter(sg => sg.gap.severity === 'medium').length;
  const totalLow    = allSiteGaps.filter(sg => sg.gap.severity === 'low').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Gap Analysis</h1>
        <p className="text-neutral-500 text-sm mt-1">
          Cross-site SEO recommendations · {audits.length} sites · {totalGaps} issues
          {totalHigh > 0 && <span className="text-red-400 ml-2">· {totalHigh} high priority</span>}
        </p>
      </div>

      {/* Client component handles filtering + display */}
      <GapsClient
        allSiteGaps={allSiteGaps}
        sites={sites}
        categories={categories}
      />
    </div>
  );
}
