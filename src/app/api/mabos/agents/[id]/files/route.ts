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

    const agent = db.prepare('SELECT gateway_agent_id FROM agents WHERE id = ?').get(params.id) as { gateway_agent_id: string } | undefined;
    if (!agent?.gateway_agent_id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (filename) {
      const content = await mabos.client.getAgentFile(agent.gateway_agent_id, filename);
      return NextResponse.json(content);
    }

    const files = await mabos.client.getAgentFiles(agent.gateway_agent_id);
    return NextResponse.json({ files });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
