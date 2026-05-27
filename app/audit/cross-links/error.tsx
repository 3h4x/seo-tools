'use client';

import { ErrorState } from '../../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Cross-links audit failed to load"
      description="Couldn't run the cross-site link audit. The crawl fans out across many pages — partial upstream failures can bubble up here."
    />
  );
}
