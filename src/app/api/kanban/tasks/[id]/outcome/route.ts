import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface OutcomeBody {
  agentId: string;
  status: 'done' | 'review' | 'verification';
  outcome?: string;
  deliverables?: { type: string; title: string; path?: string; description?: string }[];
  notes?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();
    const body: OutcomeBody = await request.json();
    const { agentId, status, outcome, deliverables, notes } = body;

    if (!agentId || !status) {
      return NextResponse.json({ error: 'Required: agentId, status' }, { status: 400 });
    }

    const validStatuses = ['done', 'review', 'verification'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    if (!task) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE tasks SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?
    `).run(status, outcome || notes || null, now, taskId);

    if (deliverables?.length) {
      for (const d of deliverables) {
        db.prepare(`
          INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), taskId, d.type, d.title, d.path || null, d.description || null, now);
      }
    }

    const meta = db.prepare('SELECT goal_id, initiative_id FROM kanban_card_meta WHERE task_id = ?')
      .get(taskId) as { goal_id: string; initiative_id: string | null } | undefined;

    const transitionType = status === 'done' ? 'goal_achieved' : 'action_executed';
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details)
      VALUES (?, ?, 'vividwalls', 'action', ?, 'task', ?, ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`, agentId, transitionType,
      taskId, `Task ${status}: ${(task as { title: string }).title}`,
      outcome || notes || null
    );

    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), `task_${status}`, agentId, taskId, `Agent reported task ${status}`, now);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_updated', payload: updated } as unknown as import('@/lib/types').SSEEvent);

    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
    fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
      console.error('[Outcome] Rollup trigger failed:', err)
    );

    return NextResponse.json({
      taskId,
      status,
      deliverableCount: deliverables?.length || 0,
      goalId: meta?.goal_id,
      initiativeId: meta?.initiative_id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
