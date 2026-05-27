'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Site detail failed to load"
      description="Couldn't fetch audit, Search Console, or GA4 data for this site. Retry or check the Config tab."
    />
  );
}
