import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function POST() {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    await mabos.syncEngine.syncAgents();

    const agents = db.prepare(`
      SELECT * FROM agents WHERE source = 'gateway' AND id LIKE 'mabos-%'
    `).all();

    return NextResponse.json({ ok: true, count: agents.length, agents });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Import failed: ${msg}` }, { status: 500 });
  }
}
