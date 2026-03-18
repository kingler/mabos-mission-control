import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function GET() {
  try {
    const db = getDb();
    const states = db.prepare('SELECT * FROM sync_state ORDER BY entity_type').all();
    return NextResponse.json({ states });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get sync state' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    const report = await mabos.triggerSync();
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 500 });
  }
}
