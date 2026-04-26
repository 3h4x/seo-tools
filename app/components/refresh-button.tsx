'use client';

import { useRefresh } from './refresh-context';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/format';

export default function RefreshButton() {
  const { refreshing, triggerRefresh, lastUpdated } = useRefresh();
  const [displayTime, setDisplayTime] = useState<string>('');

  useEffect(() => {
    if (lastUpdated) {
      setDisplayTime(formatRelativeTime(lastUpdated));
      // Update every minute to keep the relative time current
      const interval = setInterval(() => {
        setDisplayTime(formatRelativeTime(lastUpdated));
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [lastUpdated]);

  return (
    <div className="flex items-center gap-2">
      {lastUpdated && displayTime && (
        <span className="text-neutral-500 text-xs hidden sm:block" title={new Date(lastUpdated).toLocaleString()}>
          Updated {displayTime}
        </span>
      )}
      <button
        onClick={triggerRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 transition-colors disabled:opacity-50"
        title="Clear cache and refresh data"
      >
        {refreshing ? (
          <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        )}
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  );
}
