'use client';

import { useEffect } from 'react';
import { Disclosure, FormButton, Notice, NoticeCenteredContent } from '@/components/ui';

interface ErrorStateProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}

export function ErrorState({ error, reset, title = 'Something went wrong', description }: ErrorStateProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Notice tone="danger" size="lg" accent="left">
      <NoticeCenteredContent height="auto" className="items-start text-left space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-white">{title}</h2>
          <p className="text-xs text-neutral-400">
            {description ?? 'The page failed to load. This is usually a transient API error — try again.'}
          </p>
        </div>
        <Disclosure
          className="text-xs text-neutral-500"
          summary="Error detail"
          summaryClassName="cursor-pointer hover:text-neutral-300"
        >
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-neutral-400">
            {error.message || 'Unknown error'}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        </Disclosure>
        <FormButton variant="primary" size="sm" onClick={reset}>
          Try again
        </FormButton>
      </NoticeCenteredContent>
    </Notice>
  );
}
