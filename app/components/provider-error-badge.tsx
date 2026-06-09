import { Badge } from '@/components/ui';

export function ProviderErrorBadge({ label = 'data unavailable' }: { label?: string }) {
  return (
    <Badge size="xs" shape="rounded" tone="danger" uppercase>
      {label}
    </Badge>
  );
}
