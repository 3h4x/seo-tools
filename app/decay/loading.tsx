import { SkeletonHeader, SkeletonSummaryRow, SkeletonTable } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonSummaryRow count={3} />
      <SkeletonTable rows={10} />
    </div>
  );
}
