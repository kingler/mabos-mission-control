import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

interface RouteParams { params: Promise<{ id: string }> }

// GET /api/kanban/campaigns/:id
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();

    const campaign = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM kanban_initiatives i WHERE i.campaign_id = c.id) as initiative_count,
        (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.campaign_id = c.id) as task_count
      FROM kanban_campaigns c WHERE c.id = ?
    `).get(id);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const initiatives = db.prepare(`
      SELECT i.*, (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.initiative_id = i.id) as task_count
      FROM kanban_initiatives i WHERE i.campaign_id = ? ORDER BY i.priority ASC
    `).all(id);

    return NextResponse.json({ ...(campaign as object), initiatives });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/kanban/campaigns/:id
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT * FROM kanban_campaigns WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    const allowedFields: Record<string, string> = {
      title: 'title', description: 'description', metaType: 'meta_type',
      domain: 'domain', stage: 'stage', ownerId: 'owner_id',
      priority: 'priority', startDate: 'start_date', endDate: 'end_date',
      progressPct: 'progress_pct', budget: 'budget', tags: 'tags',
    };

    for (const [key, col] of Object.entries(allowedFields)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(key === 'tags' && typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE kanban_campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (body.stage && body.stage !== existing.stage) {
      db.prepare(`
        INSERT INTO stage_transitions (id, entity_tier, entity_id, from_stage, to_stage, agent_id, reason)
        VALUES (?, 'campaign', ?, ?, ?, ?, ?)
      `).run(`st-${uuidv4().slice(0, 8)}`, id, existing.stage, body.stage, body.agentId || null, body.reason || null);
    }

    const updated = db.prepare('SELECT * FROM kanban_campaigns WHERE id = ?').get(id);
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/kanban/campaigns/:id
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDb();
    const existing = db.prepare('SELECT id FROM kanban_campaigns WHERE id = ?').get(id);
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    db.prepare('DELETE FROM kanban_campaigns WHERE id = ?').run(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
