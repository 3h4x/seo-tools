'use client';

import { ErrorState } from './components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Overview failed to load"
      description="The dashboard couldn't fetch site metrics. This is usually a transient Google API error."
    />
  );
}
