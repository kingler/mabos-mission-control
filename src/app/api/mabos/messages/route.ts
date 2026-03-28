import { NextRequest, NextResponse } from 'next/server';
import { readAllInboxMessages } from '@/lib/mabos/workspace-reader';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const agent = searchParams.get('agent');
    const performative = searchParams.get('performative');
    const priority = searchParams.get('priority');
    const read = searchParams.get('read');
    const limit = parseInt(searchParams.get('limit') || '200', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let messages = readAllInboxMessages();

    // Collect metadata before filtering
    const allAgents = Array.from(new Set(messages.flatMap(m => [m.from, m.to]))).sort();
    const allPerformatives = Array.from(new Set(messages.map(m => m.performative))).sort();

    // Apply filters
    if (agent) {
      messages = messages.filter(m => m.from === agent || m.to === agent);
    }
    if (performative) {
      messages = messages.filter(m => m.performative === performative);
    }
    if (priority) {
      messages = messages.filter(m => m.priority === priority);
    }
    if (read !== null) {
      const isRead = read === 'true';
      messages = messages.filter(m => m.read === isRead);
    }

    const total = messages.length;

    // Paginate
    const paginated = messages.slice(offset, offset + limit);

    // Strip _agentDir, add agentContext
    const result = paginated.map(({ _agentDir, ...rest }) => ({
      ...rest,
      agentContext: _agentDir,
    }));

    return NextResponse.json({
      messages: result,
      total,
      agents: allAgents,
      performatives: allPerformatives,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
