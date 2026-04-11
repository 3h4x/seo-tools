import { Skeleton, SkeletonCard, SkeletonTable, SkeletonScoreRow } from '../../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
      <SkeletonScoreRow />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonTable rows={8} />
      <SkeletonCard />
      <SkeletonTable rows={4} />
      <SkeletonTable rows={4} />
      <SkeletonCard />
    </div>
  );
}
