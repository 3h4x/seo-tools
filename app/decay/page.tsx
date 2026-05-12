import { detectAllDecay } from '@/lib/decay';
import { getManagedSites } from '@/lib/sites';
import { DecaySection } from '../components/decay-section';

export const revalidate = 300;

export default async function DecayPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const period = params.period === '30' ? 30 : 7;

  const [managedSites, decayResults] = await Promise.all([
    getManagedSites(),
    detectAllDecay(period as 7 | 30),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Decay</h1>
        <p className="text-neutral-500 text-sm mt-1">Cross-site traffic losses surfaced outside the audit page</p>
      </div>
      <DecaySection period={period as 7 | 30} decayResults={decayResults} siteCount={managedSites.length} />
    </div>
  );
}
