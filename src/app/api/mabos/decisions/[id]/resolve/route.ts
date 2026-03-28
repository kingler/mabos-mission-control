import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { readDecisionQueue, writeDecisionQueue } from '@/lib/mabos/workspace-reader';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { resolution, optionId, feedback } = body;
    const now = new Date().toISOString();

    // Update decision-queue.json on disk
    const items = readDecisionQueue();
    const idx = items.findIndex(d => d.id === params.id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    items[idx] = {
      ...items[idx],
      status: resolution === 'defer' ? 'deferred' : 'resolved',
    };
    writeDecisionQueue(items);

    // Also update local SQLite cache
    try {
      const db = getDb();
      db.prepare(`
        UPDATE mabos_decisions SET status = ?, feedback = ?, resolved_at = ?, synced_at = ?
        WHERE id = ?
      `).run(
        resolution === 'defer' ? 'deferred' : 'resolved',
        feedback || null,
        now,
        now,
        params.id
      );
    } catch {
      // SQLite cache update is best-effort
    }

    return NextResponse.json({
      ok: true,
      id: params.id,
      resolution,
      optionId,
      resolvedAt: now,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
