import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    const body = await request.json();

    await mabos.client.updateCronJob(mabos.getBusinessId(), params.id, body);

    // Update local cache
    if (body.enabled !== undefined) {
      db.prepare('UPDATE mabos_cron_jobs SET enabled = ?, synced_at = ? WHERE id = ?')
        .run(body.enabled ? 1 : 0, new Date().toISOString(), params.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
