'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Config failed to load"
      description="Couldn't render the configuration page. Retry, or reload to recover from a transient error."
    />
  );
}
