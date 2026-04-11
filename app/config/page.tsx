import ConfigForm from '../components/config-form';
import SitesManager from '../components/sites-manager';
import { getConfig, dbGetSites } from '@/lib/db';

export default function ConfigPage() {
  const dbValue = getConfig('google_sa_key');
  const envValue = process.env.GOOGLE_SA_KEY_JSON ?? null;

  const source: 'db' | 'env' | 'none' = dbValue ? 'db' : envValue ? 'env' : 'none';
  const hasAuth = source !== 'none';

  const sites = dbGetSites();

  return (
    <div className="p-6 space-y-10">
      <ConfigForm source={source} />
      <hr className="border-neutral-800" />
      <SitesManager initialSites={sites} hasAuth={hasAuth} />
    </div>
  );
}
