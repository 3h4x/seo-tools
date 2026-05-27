'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Alerts failed to load"
      description="Couldn't load alert history or managed sites. This is usually a transient SQLite or fetch error — try again."
    />
  );
}
