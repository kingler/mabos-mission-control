import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/kanban/goals — list all goals, optionally filtered
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || 'vividwalls';
    const domain = searchParams.get('domain');
    const stage = searchParams.get('stage');

    let query = `
      SELECT g.*,
        (SELECT COUNT(*) FROM kanban_campaigns c WHERE c.goal_id = g.id) as campaign_count,
        (SELECT COUNT(*) FROM kanban_initiatives i WHERE i.goal_id = g.id) as initiative_count,
        (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.goal_id = g.id) as task_count,
        (SELECT COUNT(*) FROM kanban_card_meta m 
          JOIN tasks t ON t.id = m.task_id 
          WHERE m.goal_id = g.id AND t.status = 'done') as completed_task_count
      FROM kanban_goals g
      WHERE g.business_id = ?
    `;
    const params: unknown[] = [businessId];

    if (domain) { query += ' AND g.domain = ?'; params.push(domain); }
    if (stage) { query += ' AND g.stage = ?'; params.push(stage); }

    query += ' ORDER BY g.priority ASC, g.created_at DESC';

    const goals = db.prepare(query).all(...params);
    return NextResponse.json({ goals });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kanban/goals — create a new goal
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { title, description, metaType, domain, ownerId, priority, targetDate, kpiDefinition, tags, businessId } = body;

    if (!title || !domain) {
      return NextResponse.json({ error: 'title and domain are required' }, { status: 400 });
    }

    const id = `g-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO kanban_goals (id, business_id, title, description, meta_type, domain, stage, owner_id, priority, target_date, kpi_definition, tags)
      VALUES (?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)
    `).run(
      id,
      businessId || 'vividwalls',
      title,
      description || null,
      metaType || 'strategic',
      domain,
      ownerId || null,
      priority || 5,
      targetDate || null,
      kpiDefinition ? JSON.stringify(kpiDefinition) : null,
      tags ? JSON.stringify(tags) : null,
    );

    // Log BDI event: desire adopted
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary)
      VALUES (?, ?, ?, 'desire', 'desire_adopted', 'goal', ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`,
      ownerId || 'system',
      businessId || 'vividwalls',
      id,
      `Goal created: ${title}`,
    );

    const goal = db.prepare('SELECT * FROM kanban_goals WHERE id = ?').get(id);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
