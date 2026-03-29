import { NextRequest, NextResponse } from 'next/server';
import {
  goalTemplate,
  campaignTemplate,
  initiativeTemplate,
  taskTemplate,
  DOMAIN_AGENTS,
  resolveTaskAgent,
  type GoalTemplateInput,
  type CampaignTemplateInput,
  type InitiativeTemplateInput,
  type TaskTemplateInput,
} from '@/lib/kanban/templates';

/**
 * GET /api/kanban/templates
 *
 * Returns template metadata: domain→agent mappings and available templates.
 */
export async function GET() {
  return NextResponse.json({
    domainAgents: DOMAIN_AGENTS,
    templates: ['goal', 'campaign', 'initiative', 'task'],
    description: 'POST with { type, input } to generate a populated entity from a template.',
  });
}

/**
 * POST /api/kanban/templates
 *
 * Generate a fully-populated entity from minimal input.
 *
 * Body: {
 *   type: 'goal' | 'campaign' | 'initiative' | 'task',
 *   input: GoalTemplateInput | CampaignTemplateInput | InitiativeTemplateInput | TaskTemplateInput
 * }
 *
 * Returns the populated entity ready for creation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, input } = body;

    if (!type || !input) {
      return NextResponse.json(
        { error: 'Missing required fields: type, input' },
        { status: 400 }
      );
    }

    let result;

    switch (type) {
      case 'goal':
        result = goalTemplate(input as GoalTemplateInput);
        break;
      case 'campaign':
        result = campaignTemplate(input as CampaignTemplateInput);
        break;
      case 'initiative':
        result = initiativeTemplate(input as InitiativeTemplateInput);
        break;
      case 'task':
        result = taskTemplate(input as TaskTemplateInput);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown template type: ${type}. Use: goal, campaign, initiative, task` },
          { status: 400 }
        );
    }

    return NextResponse.json({ type, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
