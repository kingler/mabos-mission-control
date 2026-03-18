import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function GET() {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    const decisions = await mabos.client.getDecisions();
    return NextResponse.json({ decisions });
  } catch (error) {
    // Fallback to cached decisions
    try {
      const db = getDb();
      const cached = db.prepare('SELECT * FROM mabos_decisions ORDER BY synced_at DESC').all();
      return NextResponse.json({ decisions: cached, cached: true });
    } catch {
      return NextResponse.json({ error: 'Failed to fetch decisions' }, { status: 500 });
    }
  }
}
