import { SkeletonHeader, SkeletonSummaryRow, SkeletonSiteCard } from './components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonSummaryRow count={4} />
      <div className="grid gap-4">
        {[...Array(6)].map((_, i) => (
          <SkeletonSiteCard key={i} />
        ))}
      </div>
    </div>
  );
}
