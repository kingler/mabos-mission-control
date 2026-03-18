import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/kanban/cards — list task-to-kanban links
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const initiativeId = searchParams.get('initiativeId');
    const campaignId = searchParams.get('campaignId');

    let query = `
      SELECT m.*, t.title, t.status, t.priority, t.assigned_agent_id, t.due_date
      FROM kanban_card_meta m JOIN tasks t ON t.id = m.task_id WHERE 1=1
    `;
    const params: unknown[] = [];

    if (goalId) { query += ' AND m.goal_id = ?'; params.push(goalId); }
    if (campaignId) { query += ' AND m.campaign_id = ?'; params.push(campaignId); }
    if (initiativeId) { query += ' AND m.initiative_id = ?'; params.push(initiativeId); }

    query += ' ORDER BY t.priority, t.created_at DESC';

    const cards = db.prepare(query).all(...params);
    return NextResponse.json({ cards });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kanban/cards — link an existing task to the kanban hierarchy
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { taskId, goalId, campaignId, initiativeId, metaType, domain, storyPoints, tags } = body;

    if (!taskId || !goalId) {
      return NextResponse.json({ error: 'taskId and goalId are required' }, { status: 400 });
    }

    // Verify task exists
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Verify goal exists
    const goal = db.prepare('SELECT id, domain, business_id FROM kanban_goals WHERE id = ?').get(goalId) as any;
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    db.prepare(`
      INSERT OR REPLACE INTO kanban_card_meta (task_id, goal_id, campaign_id, initiative_id, meta_type, domain, story_points, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId, goalId, campaignId || null, initiativeId || null,
      metaType || 'operational', domain || goal.domain,
      storyPoints || null, tags ? JSON.stringify(tags) : null,
    );

    // BDI: action executed (task linked)
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary)
      VALUES (?, 'system', ?, 'action', 'action_executed', 'task', ?, ?)
    `).run(`bdi-${uuidv4().slice(0, 8)}`, goal.business_id, taskId, `Task linked to goal ${goalId}`);

    const card = db.prepare('SELECT * FROM kanban_card_meta WHERE task_id = ?').get(taskId);
    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
