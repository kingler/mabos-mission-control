import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface GoalStatusRow {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
  domain: string;
  owner_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
}

interface InitiativeRow {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
  campaign_id: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier') || 'goal';

    if (tier === 'initiative') {
      const initiative = db.prepare(
        'SELECT id, title, stage, progress_pct, campaign_id FROM kanban_initiatives WHERE id = ?'
      ).get(id) as InitiativeRow | undefined;
      if (!initiative) {
        return NextResponse.json({ error: `Initiative ${id} not found` }, { status: 404 });
      }
      const tasks = db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.assigned_agent_id, t.updated_at
        FROM tasks t JOIN kanban_card_meta m ON m.task_id = t.id
        WHERE m.initiative_id = ?
        ORDER BY t.priority DESC, t.created_at ASC
      `).all(id) as TaskRow[];
      const taskStats = {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        blocked: tasks.filter(t => t.status === 'review' || t.status === 'verification').length,
      };
      return NextResponse.json({ initiative, tasks, taskStats });
    }

    if (tier === 'campaign') {
      const campaign = db.prepare(
        'SELECT id, title, stage, progress_pct FROM kanban_campaigns WHERE id = ?'
      ).get(id) as CampaignRow | undefined;
      if (!campaign) {
        return NextResponse.json({ error: `Campaign ${id} not found` }, { status: 404 });
      }
      const initiatives = db.prepare(
        'SELECT id, title, stage, progress_pct, campaign_id FROM kanban_initiatives WHERE campaign_id = ?'
      ).all(id) as InitiativeRow[];
      const tasks = db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.assigned_agent_id, t.updated_at
        FROM tasks t JOIN kanban_card_meta m ON m.task_id = t.id
        WHERE m.campaign_id = ?
        ORDER BY t.priority DESC, t.created_at ASC
      `).all(id) as TaskRow[];
      const taskStats = {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        blocked: tasks.filter(t => t.status === 'review' || t.status === 'verification').length,
      };
      return NextResponse.json({ campaign, initiatives, tasks, taskStats });
    }

    // Default: goal-level
    const goal = db.prepare(
      'SELECT id, title, stage, progress_pct, domain, owner_id FROM kanban_goals WHERE id = ?'
    ).get(id) as GoalStatusRow | undefined;
    if (!goal) {
      return NextResponse.json({ error: `Goal ${id} not found` }, { status: 404 });
    }
    const campaigns = db.prepare(
      'SELECT id, title, stage, progress_pct FROM kanban_campaigns WHERE goal_id = ?'
    ).all(id) as CampaignRow[];
    const initiatives = db.prepare(
      'SELECT id, title, stage, progress_pct, campaign_id FROM kanban_initiatives WHERE goal_id = ?'
    ).all(id) as InitiativeRow[];
    const tasks = db.prepare(`
      SELECT t.id, t.title, t.status, t.priority, t.assigned_agent_id, t.updated_at
      FROM tasks t JOIN kanban_card_meta m ON m.task_id = t.id
      WHERE m.goal_id = ?
      ORDER BY t.priority DESC, t.created_at ASC
    `).all(id) as TaskRow[];
    const taskStats = {
      total: tasks.length,
      done: tasks.filter(t => t.status === 'done').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.status === 'review' || t.status === 'verification').length,
    };
    return NextResponse.json({ goal, campaigns, initiatives, tasks, taskStats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
