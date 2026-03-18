import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/kanban/initiatives
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const goalId = searchParams.get('goalId');
    const stage = searchParams.get('stage');

    let query = `
      SELECT i.*, (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.initiative_id = i.id) as task_count
      FROM kanban_initiatives i WHERE 1=1
    `;
    const params: unknown[] = [];

    if (campaignId) { query += ' AND i.campaign_id = ?'; params.push(campaignId); }
    if (goalId) { query += ' AND i.goal_id = ?'; params.push(goalId); }
    if (stage) { query += ' AND i.stage = ?'; params.push(stage); }

    query += ' ORDER BY i.priority ASC, i.created_at DESC';

    const initiatives = db.prepare(query).all(...params);
    return NextResponse.json({ initiatives });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kanban/initiatives
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { campaignId, title, description, metaType, domain, ownerId, priority, startDate, endDate, tags } = body;

    if (!campaignId || !title) {
      return NextResponse.json({ error: 'campaignId and title are required' }, { status: 400 });
    }

    const campaign = db.prepare('SELECT id, goal_id, business_id, domain FROM kanban_campaigns WHERE id = ?').get(campaignId) as any;
    if (!campaign) {
      return NextResponse.json({ error: 'Parent campaign not found' }, { status: 404 });
    }

    const id = `i-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO kanban_initiatives (id, campaign_id, goal_id, business_id, title, description, meta_type, domain, stage, owner_id, priority, start_date, end_date, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)
    `).run(
      id, campaignId, campaign.goal_id, campaign.business_id,
      title, description || null, metaType || 'tactical',
      domain || campaign.domain, ownerId || null,
      priority || 5, startDate || null, endDate || null,
      tags ? JSON.stringify(tags) : null,
    );

    // BDI: plan selected
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary)
      VALUES (?, ?, ?, 'intention', 'plan_selected', 'initiative', ?, ?)
    `).run(`bdi-${uuidv4().slice(0, 8)}`, ownerId || 'system', campaign.business_id, id, `Initiative created: ${title}`);

    const initiative = db.prepare('SELECT * FROM kanban_initiatives WHERE id = ?').get(id);
    return NextResponse.json({ initiative }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
