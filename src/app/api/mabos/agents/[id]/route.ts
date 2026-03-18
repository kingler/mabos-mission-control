import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);

    // Get local agent data
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(params.id);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Get BDI detail from MABOS API
    const gatewayId = (agent as Record<string, unknown>).gateway_agent_id as string;
    let bdiDetail = null;
    try {
      bdiDetail = await mabos.client.getAgentDetail(gatewayId);
    } catch {
      // MABOS may be unavailable, return cached data
    }

    return NextResponse.json({ agent, bdiDetail });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch agent detail' }, { status: 500 });
  }
}
