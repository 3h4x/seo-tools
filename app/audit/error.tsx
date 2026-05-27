'use client';

import { ErrorState } from '../components/error-state';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Audit failed to load"
      description="Couldn't run the SEO health audit for your sites. This is usually a transient fetch error."
    />
  );
}
