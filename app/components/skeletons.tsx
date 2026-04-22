export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-800 rounded ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-neutral-700 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-3 w-64" />
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 space-y-4">
      <Skeleton className="h-4 w-48" />
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-1.5 rounded-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonSummaryRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonSiteCard() {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function SiteListSkeleton() {
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
