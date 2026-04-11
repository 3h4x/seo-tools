import { Skeleton, SkeletonSummaryRow, SkeletonTable } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
      {/* Audit score row */}
      <div className="flex gap-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-24" />
      </div>
      {/* SC metrics */}
      <SkeletonSummaryRow count={4} />
      {/* GA4 metrics */}
      <SkeletonSummaryRow count={5} />
      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      {/* Tables */}
      <SkeletonTable rows={6} />
      <SkeletonTable rows={6} />
      {/* Audit details */}
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
