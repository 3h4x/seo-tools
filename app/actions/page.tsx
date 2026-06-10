import { Badge, Notice, NoticeCenteredContent, Surface, TextLink } from '@/components/ui';
import { loadActionQueue } from '@/lib/actions';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { PartialFailureBanner } from '../components/partial-failure-banner';

export const revalidate = 300;

const ACTION_PRIORITY_TONES = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
} as const;

const ACTION_KIND_TONES = {
  gap: 'accent',
  decay: 'info',
  keyword: 'successMuted',
} as const;

const PRIORITY_COUNTS = [
  { label: 'Critical', key: 'critical' },
  { label: 'High', key: 'high' },
  { label: 'Medium', key: 'medium' },
  { label: 'Low', key: 'low' },
] as const;

const COLUMNS: DataTableColumn[] = [
  { label: 'Priority', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3 whitespace-nowrap' },
  { label: 'Site', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3' },
  { label: 'Issue', rowHeader: true, className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3 min-w-[280px]' },
  { label: 'Affected', className: 'px-4 py-3 font-semibold hidden lg:table-cell', cellClassName: 'px-4 py-3 hidden lg:table-cell max-w-[260px] truncate' },
  { label: 'Impact', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3 text-right whitespace-nowrap' },
  { label: '', align: 'right', className: 'px-4 py-3', cellClassName: 'px-4 py-3 text-right whitespace-nowrap' },
];

export default async function ActionsPage() {
  const { items, counts, failures } = await loadActionQueue(7);

  const rows = items.map((item) => ([
    <div key={`${item.id}-priority`} className="flex items-center gap-2">
      <Badge uppercase tone={ACTION_PRIORITY_TONES[item.priority]} className="font-semibold">
        {item.priority}
      </Badge>
      <Badge uppercase tone={ACTION_KIND_TONES[item.kind]} className="hidden sm:inline-flex font-semibold">
        {item.kind}
      </Badge>
    </div>,
    <div key={`${item.id}-site`} className="space-y-0.5">
      <div className="font-semibold text-white">{item.siteName}</div>
      <div className="text-[11px] text-neutral-500">{item.siteDomain}</div>
    </div>,
    <div key={`${item.id}-issue`} className="space-y-1">
      <div className="font-semibold text-neutral-100">{item.title}</div>
      <p className="text-xs text-neutral-500 whitespace-normal">{item.detail}</p>
    </div>,
    <span key={`${item.id}-affected`} className="text-xs text-neutral-400">{item.affected}</span>,
    <span key={`${item.id}-impact`} className="font-semibold text-neutral-100">{item.impactLabel}</span>,
    <TextLink key={`${item.id}-link`} href={item.href}>
      Open site →
    </TextLink>,
  ]));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Actions</h1>
          <p className="text-sm text-neutral-500 mt-1">Ranked fixes across all sites using existing audit, decay, and keyword snapshot signals.</p>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          {PRIORITY_COUNTS.map(({ label, key }) => (
            <Badge key={key} size="md" shape="rounded" tone={ACTION_PRIORITY_TONES[key]} className="gap-2">
              <span className="font-semibold">{label}</span>
              <span className="font-mono">{counts[key]}</span>
            </Badge>
          ))}
        </div>
      </div>

      <PartialFailureBanner failures={failures} />

      {items.length === 0 ? (
        <Notice size="lg">
          <NoticeCenteredContent height="sm" textTone="muted">
            <p className="text-neutral-300 font-semibold">No ranked actions yet.</p>
            <p className="mt-1">Add managed sites, snapshots, and audit data to populate the queue.</p>
          </NoticeCenteredContent>
        </Notice>
      ) : (
        <Surface padding="none" className="overflow-x-auto">
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKeys={items.map((item) => item.id)}
            monospaceCells={false}
            containerClassName="overflow-x-auto"
            tableClassName="w-full text-sm min-w-[900px]"
          />
        </Surface>
      )}
    </div>
  );
}
