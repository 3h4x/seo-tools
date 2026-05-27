'use client';

import { ErrorState } from '../../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Site performance failed to load"
      description="Couldn't gather Core Web Vitals for this site (RUM + PSI). Retry, or fall back to the overview at /performance."
    />
  );
}
