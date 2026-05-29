import { Notice, TextLink } from '@/components/ui';
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
      <TextLink href="/config" size="inherit" variant="inherit" className="text-white underline">add sites in the Config tab</TextLink>.
    </>
  ) : (
    <>
      Google service account not configured —{' '}
      <TextLink href="/config" size="inherit" variant="inherit" className="text-white underline">add credentials in the Config tab</TextLink>{' '}
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
    <Notice size="spacious" className="rounded border-neutral-800 bg-transparent text-center text-sm text-neutral-500">
      {content}
    </Notice>
  );
}
