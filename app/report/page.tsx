import { VALID_DAYS } from '@/lib/constants';
import { ReportPageContent } from '../components/report-page-content';

export const revalidate = 300;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const rawDays = parseInt(params.days || '7');
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 7;

  return ReportPageContent({ title: 'Report', days });
}
