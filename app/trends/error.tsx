'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Trends failed to load"
      description="Couldn't load historical snapshot data. This is usually a transient API or database error."
    />
  );
}
