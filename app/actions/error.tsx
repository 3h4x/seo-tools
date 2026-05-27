'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Actions failed to load"
      description="Couldn't assemble the prioritized action queue. This is usually a transient audit or snapshot fetch error — try again."
    />
  );
}
