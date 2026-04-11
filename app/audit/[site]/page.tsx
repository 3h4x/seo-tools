import { redirect } from 'next/navigation';

export default async function SiteAuditPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  redirect(`/${site}`);
}
