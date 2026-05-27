'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Opportunities failed to load"
      description="Couldn't fetch Search Console data needed to compute opportunities. Retry once the API recovers."
    />
  );
}
