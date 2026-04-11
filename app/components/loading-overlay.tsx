'use client';

import { useRef, useEffect } from 'react';
import { useRefresh } from './refresh-context';
import { Skeleton, SkeletonCard, SkeletonTable, SkeletonSummaryRow } from './skeletons';

function SkeletonPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-6 mt-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <SkeletonSummaryRow count={4} />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonTable />
      <SkeletonCard />
      <SkeletonTable />
    </div>
  );
}

export default function LoadingOverlay({ children }: { children: React.ReactNode }) {
  const { refreshing, markDone } = useRefresh();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!refreshing || !contentRef.current) return;

    let timeout: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        markDone();
        observer.disconnect();
      }, 200);
    });

    observer.observe(contentRef.current, { childList: true, subtree: true, characterData: true });

    const safety = setTimeout(() => {
      markDone();
      observer.disconnect();
    }, 60_000);

    return () => {
      clearTimeout(timeout);
      clearTimeout(safety);
      observer.disconnect();
    };
  }, [refreshing, markDone]);

  return (
    <div>
      <div ref={contentRef} style={refreshing ? { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' } : undefined}>
        {children}
      </div>
      {refreshing && <SkeletonPage />}
    </div>
  );
}
