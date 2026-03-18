import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);

    await mabos.client.triggerCronJob(mabos.getBusinessId(), params.id);

    // Update local last_run
    db.prepare('UPDATE mabos_cron_jobs SET last_run = ?, synced_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), params.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Trigger failed: ${msg}` }, { status: 500 });
  }
}
