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

    const agent = db.prepare('SELECT gateway_agent_id FROM agents WHERE id = ?').get(params.id) as { gateway_agent_id: string } | undefined;
    if (!agent?.gateway_agent_id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const result = await mabos.client.triggerBdiCycle(mabos.getBusinessId(), agent.gateway_agent_id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `BDI cycle failed: ${msg}` }, { status: 500 });
  }
}
