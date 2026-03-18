import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/kanban/campaigns — list campaigns, filtered by goalId
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const stage = searchParams.get('stage');

    let query = `
      SELECT c.*,
        (SELECT COUNT(*) FROM kanban_initiatives i WHERE i.campaign_id = c.id) as initiative_count,
        (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.campaign_id = c.id) as task_count
      FROM kanban_campaigns c WHERE 1=1
    `;
    const params: unknown[] = [];

    if (goalId) { query += ' AND c.goal_id = ?'; params.push(goalId); }
    if (stage) { query += ' AND c.stage = ?'; params.push(stage); }

    query += ' ORDER BY c.priority ASC, c.created_at DESC';

    const campaigns = db.prepare(query).all(...params);
    return NextResponse.json({ campaigns });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kanban/campaigns — create a campaign under a goal
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { goalId, title, description, metaType, domain, ownerId, priority, startDate, endDate, budget, tags } = body;

    if (!goalId || !title) {
      return NextResponse.json({ error: 'goalId and title are required' }, { status: 400 });
    }

    const goal = db.prepare('SELECT id, business_id, domain FROM kanban_goals WHERE id = ?').get(goalId) as any;
    if (!goal) {
      return NextResponse.json({ error: 'Parent goal not found' }, { status: 404 });
    }

    const id = `c-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO kanban_campaigns (id, goal_id, business_id, title, description, meta_type, domain, stage, owner_id, priority, start_date, end_date, budget, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?)
    `).run(
      id, goalId, goal.business_id, title,
      description || null, metaType || 'operational',
      domain || goal.domain, ownerId || null,
      priority || 5, startDate || null, endDate || null,
      budget || null, tags ? JSON.stringify(tags) : null,
    );

    // BDI: intention committed
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary)
      VALUES (?, ?, ?, 'intention', 'intention_committed', 'campaign', ?, ?)
    `).run(`bdi-${uuidv4().slice(0, 8)}`, ownerId || 'system', goal.business_id, id, `Campaign created: ${title}`);

    const campaign = db.prepare('SELECT * FROM kanban_campaigns WHERE id = ?').get(id);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
