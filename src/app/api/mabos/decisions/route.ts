import { NextRequest, NextResponse } from 'next/server';
import { readDecisionQueue, type DecisionQueueItem } from '@/lib/mabos/workspace-reader';

function mapToFrontendDecision(d: DecisionQueueItem) {
  return {
    id: d.id,
    title: d.title,
    summary: d.description,
    urgency: d.urgency,
    agentId: d.agent,
    agentName: d.agent.toUpperCase(),
    businessId: 'vividwalls',
    businessName: 'VividWalls',
    options: d.options.map(o => ({
      id: o.id,
      label: o.label,
      description: [o.impact, o.cost !== '0' ? `Cost: $${o.cost}` : null, `Risk: ${o.risk}`]
        .filter(Boolean)
        .join(' | '),
      recommended: o.id === d.recommendation,
    })),
    agentRecommendation: d.recommendation,
    createdAt: d.created,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const urgency = searchParams.get('urgency');
    const agent = searchParams.get('agent');
    const status = searchParams.get('status');

    let items = readDecisionQueue();

    if (urgency) {
      items = items.filter(d => d.urgency === urgency);
    }
    if (agent) {
      items = items.filter(d => d.agent === agent);
    }
    if (status) {
      items = items.filter(d => d.status === status);
    } else {
      // Default: only pending decisions
      items = items.filter(d => d.status === 'pending');
    }

    const decisions = items.map(mapToFrontendDecision);

    return NextResponse.json({ decisions, total: decisions.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
