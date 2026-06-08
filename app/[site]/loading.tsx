import { Skeleton } from '@/components/ui';
import { SkeletonChart, SkeletonChipRow, SkeletonHeader, SkeletonSummaryRow, SkeletonTable } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader
        eyebrowClassName="h-4 w-24"
        titleClassName="h-7 w-48"
        subtitleClassName="h-4 w-56"
      />
      <SkeletonChipRow className="gap-6" itemClassName="h-5 w-24" />
      <SkeletonSummaryRow count={4} />
      <SkeletonSummaryRow count={5} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonTable rows={6} />
      <SkeletonTable rows={6} />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
