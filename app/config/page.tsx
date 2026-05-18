'use client';

import { useEffect, useState } from 'react';
import ConfigForm from '../components/config-form';
import OperationalStatusPanel from '../components/operational-status-panel';
import PagespeedKeyForm from '../components/pagespeed-key-form';
import SitesManager from '../components/sites-manager';
import AlertDeliveryForm from '../components/alert-delivery-form';
import AlertRulesManager from '../components/alert-rules-manager';
import type { OperationalStatus } from '@/lib/db';
import type { Site } from '@/lib/sites';

export default function ConfigPage() {
  const [source, setSource] = useState<'db' | 'env' | 'none'>('none');
  const [sites, setSites] = useState<Site[]>([]);
  const [statuses, setStatuses] = useState<OperationalStatus[]>([]);
  const [statusError, setStatusError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      fetch('/api/config').then(async (r) => {
        if (!r.ok) throw new Error('config');
        return r.json() as Promise<{ source: 'db' | 'env' | 'none' }>;
      }),
      fetch('/api/sites').then(async (r) => {
        if (!r.ok) throw new Error('sites');
        return r.json() as Promise<Site[]>;
      }),
      fetch('/api/config/operations').then(async (r) => {
        if (!r.ok) throw new Error('operations');
        return r.json() as Promise<{ statuses: OperationalStatus[] }>;
      }),
    ]).then(([configResult, sitesResult, operationsResult]) => {
      if (!active) return;

      if (configResult.status === 'fulfilled') {
        setSource(configResult.value.source);
      } else {
        console.error('Failed to load config source:', configResult.reason);
      }

      if (sitesResult.status === 'fulfilled') {
        setSites(sitesResult.value);
      } else {
        console.error('Failed to load sites:', sitesResult.reason);
      }

      if (operationsResult.status === 'fulfilled') {
        setStatuses(operationsResult.value.statuses);
        setStatusError(false);
      } else {
        console.error('Failed to load operational status:', operationsResult.reason);
        setStatuses([]);
        setStatusError(true);
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const hasAuth = source !== 'none';

  return (
    <div className="p-6 space-y-10">
      <ConfigForm source={source} />
      <hr className="border-neutral-800" />
      <OperationalStatusPanel statuses={statuses} error={statusError} />
      <hr className="border-neutral-800" />
      <PagespeedKeyForm />
      <hr className="border-neutral-800" />
      <AlertDeliveryForm />
      <hr className="border-neutral-800" />
      <AlertRulesManager sites={sites} />
      <hr className="border-neutral-800" />
      <SitesManager initialSites={sites} hasAuth={hasAuth} />
    </div>
  );
}
