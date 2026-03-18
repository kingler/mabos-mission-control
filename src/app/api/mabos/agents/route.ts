import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const agents = db.prepare(`
      SELECT * FROM agents
      WHERE source = 'gateway' AND id LIKE 'mabos-%'
      ORDER BY
        CASE WHEN parent_agent_id IS NULL THEN 0 ELSE 1 END,
        name
    `).all();

    return NextResponse.json(agents);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch MABOS agents' }, { status: 500 });
  }
}
