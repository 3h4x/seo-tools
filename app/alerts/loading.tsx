import { SkeletonHeader, SkeletonTable } from '../components/skeletons';

export default function Loading() {
  return (
    <div className="space-y-8">
      <SkeletonHeader />
      <SkeletonTable rows={8} />
    </div>
  );
}
