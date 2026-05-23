import Link from 'next/link';
import { Badge } from '@/components/ui';
import { loadActionQueue, type ActionQueueItem } from '@/lib/actions';
import { DataTable, type DataTableColumn } from '../components/data-table';

export const revalidate = 300;

const PRIORITY_STYLES: Record<ActionQueueItem['priority'], string> = {
  critical: 'text-red-300 bg-red-500/10 border-red-500/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const KIND_STYLES: Record<ActionQueueItem['kind'], string> = {
  gap: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  decay: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  keyword: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
};

const COLUMNS: DataTableColumn[] = [
  { label: 'Priority', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3 whitespace-nowrap' },
  { label: 'Site', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3' },
  { label: 'Issue', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3 min-w-[280px]' },
  { label: 'Affected', className: 'px-4 py-3 font-semibold hidden lg:table-cell', cellClassName: 'px-4 py-3 hidden lg:table-cell max-w-[260px] truncate' },
  { label: 'Impact', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-3 text-right whitespace-nowrap' },
  { label: '', align: 'right', className: 'px-4 py-3', cellClassName: 'px-4 py-3 text-right whitespace-nowrap' },
];

export default async function ActionsPage() {
  const { items, counts } = await loadActionQueue(7);

  const rows = items.map((item) => ([
    <div key={`${item.id}-priority`} className="flex items-center gap-2">
      <Badge uppercase className={`font-semibold ${PRIORITY_STYLES[item.priority]}`}>
        {item.priority}
      </Badge>
      <Badge uppercase className={`hidden sm:inline-flex font-semibold ${KIND_STYLES[item.kind]}`}>
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
    <Link key={`${item.id}-link`} href={item.href} className="text-xs text-neutral-400 hover:text-white">
      Open site →
    </Link>,
  ]));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Actions</h1>
          <p className="text-sm text-neutral-500 mt-1">Ranked fixes across all sites using existing audit, decay, and keyword snapshot signals.</p>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <PriorityCountBadge label="Critical" value={counts.critical} tone="critical" />
          <PriorityCountBadge label="High" value={counts.high} tone="high" />
          <PriorityCountBadge label="Medium" value={counts.medium} tone="medium" />
          <PriorityCountBadge label="Low" value={counts.low} tone="low" />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-neutral-300 font-semibold">No ranked actions yet.</p>
          <p className="text-sm text-neutral-500 mt-1">Add managed sites, snapshots, and audit data to populate the queue.</p>
        </div>
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKeys={items.map((item) => item.id)}
          monospaceCells={false}
          containerClassName="overflow-x-auto rounded border border-neutral-800 bg-neutral-900"
          tableClassName="w-full text-sm min-w-[900px]"
        />
      )}
    </div>
  );
}

function PriorityCountBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'high' | 'medium' | 'low';
}) {
  return (
    <Badge size="md" shape="rounded" className={`gap-2 ${PRIORITY_STYLES[tone]}`}>
      <span className="font-semibold">{label}</span>
      <span className="font-mono">{value}</span>
    </Badge>
  );
}
