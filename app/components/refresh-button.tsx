'use client';

import { useRefresh } from './refresh-context';
import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/format';
import { Badge, FormButton, Spinner } from '@/components/ui';
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
        <Badge
          size="inline"
          tone="mutedText"
          borderless
          className="hidden text-xs sm:block"
          title={new Date(lastUpdated).toLocaleString()}
        >
          Updated {displayTime}
        </Badge>
      )}
      <FormButton
        type="button"
        onClick={triggerRefresh}
        disabled={refreshing}
        size="xs"
        hasIcon
        className="font-medium"
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
