import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface CreateTaskBody {
  title: string;
  description?: string;
  goalId: string;
  campaignId?: string;
  initiativeId?: string;
  assignedAgentId?: string;
  createdByAgentId: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedDuration?: string;
  domain?: string;
  workspaceId?: string;
  dependsOn?: string;
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body: CreateTaskBody = await request.json();
    const { title, description, goalId, campaignId, initiativeId,
            assignedAgentId, createdByAgentId, priority, estimatedDuration,
            domain, workspaceId, dependsOn } = body;

    if (!title || !goalId || !createdByAgentId) {
      return NextResponse.json(
        { error: 'Required: title, goalId, createdByAgentId' },
        { status: 400 }
      );
    }

    const goal = db.prepare('SELECT id, business_id, domain FROM kanban_goals WHERE id = ?')
      .get(goalId) as { id: string; business_id: string; domain: string } | undefined;
    if (!goal) {
      return NextResponse.json({ error: `Goal ${goalId} not found` }, { status: 404 });
    }

    if (campaignId) {
      const campaign = db.prepare('SELECT id FROM kanban_campaigns WHERE id = ? AND goal_id = ?')
        .get(campaignId, goalId);
      if (!campaign) {
        return NextResponse.json({ error: `Campaign ${campaignId} not found under goal ${goalId}` }, { status: 404 });
      }
    }

    if (initiativeId) {
      const initiative = db.prepare('SELECT id FROM kanban_initiatives WHERE id = ?')
        .get(initiativeId);
      if (!initiative) {
        return NextResponse.json({ error: `Initiative ${initiativeId} not found` }, { status: 404 });
      }
    }

    const taskId = uuidv4();
    const now = new Date().toISOString();
    const ws = workspaceId || 'default';
    const initialStatus = assignedAgentId ? 'assigned' : 'inbox';

    db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id,
        workspace_id, business_id, origin, estimated_duration, depends_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'mabos-agent', ?, ?, ?, ?)
    `).run(
      taskId, title, description || null, initialStatus,
      priority || 'normal', assignedAgentId || null, createdByAgentId,
      ws, goal.business_id, estimatedDuration || null, dependsOn || null,
      now, now
    );

    db.prepare(`
      INSERT INTO kanban_card_meta (task_id, goal_id, campaign_id, initiative_id, meta_type, domain)
      VALUES (?, ?, ?, ?, 'operational', ?)
    `).run(taskId, goalId, campaignId || null, initiativeId || null, domain || goal.domain);

    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, 'task_created', ?, ?, ?, ?)
    `).run(uuidv4(), createdByAgentId, taskId, `Agent created task: ${title}`, now);

    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary)
      VALUES (?, ?, ?, 'action', 'action_executed', 'task', ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`, createdByAgentId, goal.business_id,
      taskId, `Task created: ${title} [goal:${goalId}]`
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_created', payload: task } as unknown as import('@/lib/types').SSEEvent);

    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
    fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
      console.error('[TaskCreate] Rollup trigger failed:', err)
    );

    return NextResponse.json({ taskId, status: initialStatus, goalId, campaignId, initiativeId }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
