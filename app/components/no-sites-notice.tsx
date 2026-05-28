import Link from 'next/link';
import { Notice } from '@/components/ui';
import { hasGoogleCredentials } from '@/lib/google-auth';

interface Props {
  variant?: 'card' | 'inline';
}

export function NoSitesNotice({ variant = 'card' }: Props) {
  const hasCreds = hasGoogleCredentials();
  const className = 'text-neutral-500 text-sm';
  const content = hasCreds ? (
    <>
      No sites configured —{' '}
      <Link href="/config" className="text-white underline">add sites in the Config tab</Link>.
    </>
  ) : (
    <>
      Google service account not configured —{' '}
      <Link href="/config" className="text-white underline">add credentials in the Config tab</Link>{' '}
      to enable site discovery and SEO data.
    </>
  );

  if (variant === 'inline') {
    return (
      <Notice size="none" className={`${className} border-0 bg-transparent p-0`}>
        {content}
      </Notice>
    );
  }

  return (
    <Notice size="none" className="rounded border-neutral-800 bg-transparent px-4 py-8 text-center text-sm text-neutral-500">
      {content}
    </Notice>
  );
}
