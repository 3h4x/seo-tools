import { redirect } from 'next/navigation';

export default async function DecayPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const period = sp.period || '7';
  redirect(`/audit?period=${period}`);
}
