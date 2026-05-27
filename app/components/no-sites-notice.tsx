import Link from 'next/link';
import { hasGoogleCredentials } from '@/lib/google-auth';

interface Props {
  variant?: 'card' | 'inline';
}

export function NoSitesNotice({ variant = 'card' }: Props) {
  const hasCreds = hasGoogleCredentials();
  const className = variant === 'card'
    ? 'rounded border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500'
    : 'text-neutral-500 text-sm';

  if (!hasCreds) {
    return (
      <div className={className}>
        Google service account not configured —{' '}
        <Link href="/config" className="text-white underline">add credentials in the Config tab</Link>{' '}
        to enable site discovery and SEO data.
      </div>
    );
  }

  return (
    <div className={className}>
      No sites configured —{' '}
      <Link href="/config" className="text-white underline">add sites in the Config tab</Link>.
    </div>
  );
}
