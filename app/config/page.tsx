'use client';

import { useEffect, useState } from 'react';
import ConfigForm from '../components/config-form';
import OperationalStatusPanel from '../components/operational-status-panel';
import PagespeedKeyForm from '../components/pagespeed-key-form';
import SitesManager from '../components/sites-manager';
import AlertDeliveryForm from '../components/alert-delivery-form';
import AlertRulesManager from '../components/alert-rules-manager';
import { SkeletonChipRow, SkeletonHeader } from '../components/skeletons';
import { Skeleton, Surface } from '@/components/ui';
import type { OperationalStatus } from '@/lib/db';
import type { Site } from '@/lib/sites';

function FormSectionSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-28 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className={compact ? 'h-11 w-full' : 'h-48 w-full'} />
      <SkeletonChipRow count={2} itemClassName="h-9 w-20 first:w-20 last:w-24" />
    </section>
  );
}

function StatusSectionSkeleton() {
  return (
    <section className="space-y-3 max-w-5xl">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full max-w-3xl" />
      <div className="grid gap-3 md:grid-cols-2">
        {[...Array(4)].map((_, index) => (
          <Surface key={index} padding="sm" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-36" />
          </Surface>
        ))}
      </div>
    </section>
  );
}

function SitesSectionSkeleton() {
  return (
    <section className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <SkeletonHeader titleClassName="h-5 w-36" subtitleClassName="h-4 w-72" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-3">
        {[...Array(3)].map((_, index) => (
          <Surface key={index} padding="sm">
            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-20" />
            </div>
          </Surface>
        ))}
      </div>
    </section>
  );
}

function ConfigPageSkeleton() {
  return (
    <div className="p-6 space-y-10" aria-label="Loading configuration">
      <FormSectionSkeleton />
      <hr className="border-neutral-800" />
      <StatusSectionSkeleton />
      <hr className="border-neutral-800" />
      <FormSectionSkeleton compact />
      <hr className="border-neutral-800" />
      <FormSectionSkeleton compact />
      <hr className="border-neutral-800" />
      <SitesSectionSkeleton />
      <hr className="border-neutral-800" />
      <SitesSectionSkeleton />
    </div>
  );
}

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
    return <ConfigPageSkeleton />;
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
