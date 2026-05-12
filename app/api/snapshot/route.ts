import { NextResponse } from 'next/server';
import { isSnapshotRunning, runSnapshot, SnapshotAlreadyRunningError } from '@/lib/snapshot';

export async function POST() {
  if (isSnapshotRunning()) {
    return NextResponse.json({ error: 'snapshot_in_progress' }, { status: 409 });
  }

  try {
    const result = await runSnapshot();
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SnapshotAlreadyRunningError) {
      return NextResponse.json({ error: 'snapshot_in_progress' }, { status: 409 });
    }
    console.error('Snapshot failed:', e);
    return NextResponse.json({ error: 'snapshot_failed' }, { status: 500 });
  }
}
