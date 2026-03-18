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

    // First, check which files exist for this agent
    let availableFiles: string[] = [];
    try {
      const filesRes = await mabos.client.getAgentFiles(agent.gateway_agent_id);
      availableFiles = filesRes.map((f) => f.filename);
    } catch {
      // If we can't list files, return empty messages
      return NextResponse.json({ inbox: '', outbox: '' });
    }

    let inbox = '';
    let outbox = '';

    // Only attempt to read Inbox/Outbox if they exist in the file listing
    if (availableFiles.includes('Inbox.md')) {
      try {
        const inboxFile = await mabos.client.getAgentFile(agent.gateway_agent_id, 'Inbox.md');
        const raw = typeof inboxFile === 'string' ? inboxFile : inboxFile.content || '';
        // Guard against gateway returning HTML fallback
        inbox = raw.trimStart().startsWith('<!doctype') || raw.trimStart().startsWith('<html') ? '' : raw;
      } catch { /* no inbox */ }
    }

    if (availableFiles.includes('Outbox.md')) {
      try {
        const outboxFile = await mabos.client.getAgentFile(agent.gateway_agent_id, 'Outbox.md');
        const raw = typeof outboxFile === 'string' ? outboxFile : outboxFile.content || '';
        outbox = raw.trimStart().startsWith('<!doctype') || raw.trimStart().startsWith('<html') ? '' : raw;
      } catch { /* no outbox */ }
    }

    return NextResponse.json({ inbox, outbox });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
