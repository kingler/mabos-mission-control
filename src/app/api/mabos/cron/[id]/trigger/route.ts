import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';
import { getScheduler } from '@/lib/scheduler';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Handle MC-native scheduler cron jobs locally (don't forward to MABOS API)
    if (id === 'CRON-auto-dispatch') {
      const scheduler = getScheduler();
      const results = await scheduler.runOnce();
      const dispatched = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      return NextResponse.json({
        ok: true,
        message: `Manual dispatch cycle: ${dispatched} dispatched, ${failed} failed`,
        results,
      });
    }

    if (id === 'CRON-scheduler-heartbeat') {
      const scheduler = getScheduler();
      return NextResponse.json({
        ok: true,
        status: scheduler.getStatus(),
      });
    }

    // Forward all other cron jobs to MABOS API
    const db = getDb();
    const mabos = getMabosIntegration(db);

    await mabos.client.triggerCronJob(mabos.getBusinessId(), id);

    // Update local last_run
    db.prepare('UPDATE mabos_cron_jobs SET last_run = ?, synced_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Trigger failed: ${msg}` }, { status: 500 });
  }
}
