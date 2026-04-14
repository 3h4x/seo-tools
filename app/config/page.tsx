'use client';

import { useEffect, useState } from 'react';
import ConfigForm from '../components/config-form';
import SitesManager from '../components/sites-manager';

export default function ConfigPage() {
  const [source, setSource] = useState<'db' | 'env' | 'none'>('none');
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch config from API to ensure fresh data
    Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/sites').then(r => r.json()),
    ]).then(([config, sitesData]) => {
      setSource(config.source);
      setSites(sitesData);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load config:', err);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const hasAuth = source !== 'none';

  return (
    <div className="p-6 space-y-10">
      <ConfigForm source={source} />
      <hr className="border-neutral-800" />
      <SitesManager initialSites={sites} hasAuth={hasAuth} />
    </div>
  );
}
