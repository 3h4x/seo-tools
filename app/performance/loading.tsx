import { Skeleton } from '@/components/ui';
import { SkeletonHeader, SkeletonSummaryRow, SkeletonTable } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
      <SkeletonSummaryRow count={5} />
      <SkeletonTable rows={6} />
    </div>
  );
}
