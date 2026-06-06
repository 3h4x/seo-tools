import { SkeletonChipRow, SkeletonHeader, SkeletonSummaryRow, SkeletonTable } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonChipRow />
      <SkeletonSummaryRow count={5} />
      <SkeletonTable rows={6} />
    </div>
  );
}
