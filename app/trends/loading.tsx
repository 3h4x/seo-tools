import { SkeletonHeader, SkeletonChart } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      {[...Array(3)].map((_, i) => (
        <SkeletonChart key={i} />
      ))}
    </div>
  );
}
