import { Skeleton } from '@/components/ui';
import { SkeletonHeader, SkeletonSummaryRow, SkeletonTable } from '../../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader
        eyebrowClassName="h-4 w-24"
        titleClassName="h-7 w-48"
        subtitleClassName="h-4 w-56"
      />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
      <SkeletonSummaryRow count={5} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
      <SkeletonTable rows={6} />
    </div>
  );
}
