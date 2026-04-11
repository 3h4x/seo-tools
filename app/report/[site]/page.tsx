import { redirect } from 'next/navigation';

export default async function SiteReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { site } = await params;
  const sp = await searchParams;
  const days = sp.days || '7';
  redirect(`/${site}?days=${days}`);
}
