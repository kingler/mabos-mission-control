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
    const body = await request.json();

    const result = await mabos.client.resolveDecision(params.id, body);

    // Update local cache
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE mabos_decisions SET status = 'resolved', feedback = ?, resolved_at = ?, synced_at = ?
      WHERE id = ?
    `).run(body.feedback || null, now, now, params.id);

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
