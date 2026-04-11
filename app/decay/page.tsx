import { detectAllDecay, type DecaySeverity } from '@/lib/decay';
import DecayToggle from '../components/decay-toggle';

export const revalidate = 300;

const SEVERITY_COLORS: Record<DecaySeverity, { dot: string; badge: string; badgeBg: string }> = {
  severe: { dot: 'bg-red-500', badge: 'text-red-400', badgeBg: 'bg-red-500/10' },
  moderate: { dot: 'bg-amber-500', badge: 'text-amber-400', badgeBg: 'bg-amber-500/10' },
  mild: { dot: 'bg-blue-500', badge: 'text-blue-400', badgeBg: 'bg-blue-500/10' },
};

export default async function DecayPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const period = params.period === '30' ? 30 : 7;
  const results = await detectAllDecay(period as 7 | 30);

  const allDecaying = results.flatMap(r => r.decayingPages);
  const severeCount = allDecaying.filter(p => p.severity === 'severe').length;
  const sitesAffected = new Set(allDecaying.map(p => p.siteId)).size;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Decay</h1>
          <p className="text-neutral-500 text-sm mt-1">Pages losing traffic &middot; {period}-day comparison</p>
        </div>
        <DecayToggle />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-red-500 p-4">
          <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Decaying Pages</div>
          <span className="text-red-400 text-2xl font-mono font-bold">{allDecaying.length}</span>
        </div>
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-amber-500 p-4">
          <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Severe</div>
          <span className="text-amber-400 text-2xl font-mono font-bold">{severeCount}</span>
        </div>
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-blue-500 p-4">
          <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Sites Affected</div>
          <span className="text-blue-400 text-2xl font-mono font-bold">{sitesAffected}</span>
        </div>
      </div>

      {/* Decay table */}
      {allDecaying.length === 0 ? (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-emerald-500 p-8 text-center">
          <div className="text-4xl mb-3">
            <svg className="size-12 mx-auto text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <p className="text-emerald-400 font-bold text-lg">All clear — no content decay</p>
          <p className="text-neutral-500 text-sm mt-2 max-w-md mx-auto">
            Every page across all {results.length} sites is maintaining or growing traffic over the last {period} days. Keep it up!
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Declining Pages</h2>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">Page</th>
                  <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                  <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impressions</th>
                  <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Position</th>
                  <th className="px-4 py-3 font-semibold text-right">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {allDecaying.map((page, i) => {
                  let shortPage = page.page;
                  try { shortPage = new URL(page.page).pathname; } catch {}
                  const colors = SEVERITY_COLORS[page.severity];
                  return (
                    <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-neutral-400 text-xs">{page.domain}</td>
                      <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs truncate max-w-[200px]" title={page.page}>{shortPage}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        <span className="text-neutral-300">{page.currentClicks}</span>
                        <span className="text-red-400 text-[10px] ml-1">{page.clicksDelta}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono hidden md:table-cell">
                        <span className="text-neutral-400">{page.currentImpressions}</span>
                        <span className="text-red-400 text-[10px] ml-1">{page.impressionsDelta}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono hidden md:table-cell">
                        <span className="text-neutral-400">{page.currentPosition.toFixed(1)}</span>
                        {page.positionDelta > 0 && <span className="text-red-400 text-[10px] ml-1">+{page.positionDelta}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`${colors.badgeBg} ${colors.badge} text-[10px] px-2 py-0.5 rounded-full font-medium uppercase`}>
                          {page.severity}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
