import { notFound, redirect } from 'next/navigation';
import { isValidSiteId } from '@/lib/site-domain';
import { getManagedSite } from '@/lib/sites';

export default async function AuditSiteRedirectPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  if (!isValidSiteId(site)) notFound();

  const managedSite = await getManagedSite(site);
  if (!managedSite) notFound();

  redirect(`/${encodeURIComponent(managedSite.id)}`);
}
