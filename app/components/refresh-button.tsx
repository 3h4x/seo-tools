'use client';

import { useRefresh } from './refresh-context';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/format';
import { FormButton, Spinner } from '@/components/ui';
import { Icons } from './icons';

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
      <FormButton
        type="button"
        onClick={triggerRefresh}
        disabled={refreshing}
        size="xs"
        variant="ghost"
        hasIcon
        className="font-medium border border-neutral-700 hover:border-neutral-600 disabled:opacity-50"
        title="Clear cache and refresh data"
      >
        {refreshing ? (
          <Spinner />
        ) : (
          Icons.refresh
        )}
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </FormButton>
    </div>
  );
}
