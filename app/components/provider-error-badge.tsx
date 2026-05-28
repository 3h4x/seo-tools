import { Badge } from '@/components/ui';

export function ProviderErrorBadge({ label = 'data unavailable' }: { label?: string }) {
  return (
    <Badge size="xs" shape="rounded" uppercase className="border-red-500/40 bg-red-500/10 text-red-300">
      {label}
    </Badge>
  );
}
