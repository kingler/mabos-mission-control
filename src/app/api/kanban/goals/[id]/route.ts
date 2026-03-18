import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

interface RouteParams { params: Promise<{ id: string }> }

// GET /api/kanban/goals/:id — get goal with full hierarchy
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const goal = db.prepare(`
      SELECT g.*,
        (SELECT COUNT(*) FROM kanban_campaigns c WHERE c.goal_id = g.id) as campaign_count,
        (SELECT COUNT(*) FROM kanban_initiatives i WHERE i.goal_id = g.id) as initiative_count,
        (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.goal_id = g.id) as task_count,
        (SELECT COUNT(*) FROM kanban_card_meta m 
          JOIN tasks t ON t.id = m.task_id 
          WHERE m.goal_id = g.id AND t.status = 'done') as completed_task_count
      FROM kanban_goals g WHERE g.id = ?
    `).get(id);

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // Get campaigns with their initiatives
    const campaigns = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.campaign_id = c.id) as task_count
      FROM kanban_campaigns c WHERE c.goal_id = ? ORDER BY c.priority ASC
    `).all(id);

    for (const campaign of campaigns as any[]) {
      campaign.initiatives = db.prepare(`
        SELECT i.*,
          (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.initiative_id = i.id) as task_count
        FROM kanban_initiatives i WHERE i.campaign_id = ? ORDER BY i.priority ASC
      `).all(campaign.id);
    }

    return NextResponse.json({ ...(goal as object), campaigns });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/kanban/goals/:id — update a goal
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT * FROM kanban_goals WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    const allowedFields: Record<string, string> = {
      title: 'title', description: 'description', metaType: 'meta_type',
      domain: 'domain', stage: 'stage', ownerId: 'owner_id',
      priority: 'priority', targetDate: 'target_date', progressPct: 'progress_pct',
      kpiDefinition: 'kpi_definition', tags: 'tags',
    };

    for (const [key, col] of Object.entries(allowedFields)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = ?`);
        const val = (key === 'kpiDefinition' || key === 'tags') && typeof body[key] === 'object'
          ? JSON.stringify(body[key]) : body[key];
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE kanban_goals SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // Log stage transition if stage changed
    if (body.stage && body.stage !== existing.stage) {
      db.prepare(`
        INSERT INTO stage_transitions (id, entity_tier, entity_id, from_stage, to_stage, agent_id, reason)
        VALUES (?, 'goal', ?, ?, ?, ?, ?)
      `).run(
        `st-${uuidv4().slice(0, 8)}`, id,
        existing.stage, body.stage,
        body.agentId || null, body.reason || null,
      );
    }

    const updated = db.prepare('SELECT * FROM kanban_goals WHERE id = ?').get(id);
    return NextResponse.json({ goal: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/kanban/goals/:id
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM kanban_goals WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM kanban_goals WHERE id = ?').run(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
