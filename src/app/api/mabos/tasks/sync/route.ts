import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';
import type { SyncReport } from '@/lib/mabos/types';

export async function POST() {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);

    const report: SyncReport = {
      agents: { synced: 0, errors: 0 },
      goals: { inserted: 0, updated: 0, errors: 0 },
      tasksFromMabos: { inserted: 0, updated: 0, errors: 0 },
      tasksToMabos: { pushed: 0, errors: 0 },
      decisions: { synced: 0, errors: 0 },
      cronJobs: { synced: 0, errors: 0 },
      duration_ms: 0,
    };

    const start = Date.now();
    await mabos.syncEngine.syncTasksFromMabos(report);
    await mabos.syncEngine.syncTasksToMabos(report);
    report.duration_ms = Date.now() - start;

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Task sync failed: ${msg}` }, { status: 500 });
  }
}
