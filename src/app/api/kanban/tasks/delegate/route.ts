import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface DelegateBody {
  taskId: string;
  targetAgentId: string;
  delegatingAgentId: string;
  instructions: string;
  deadline?: string;
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body: DelegateBody = await request.json();
    const { taskId, targetAgentId, delegatingAgentId, instructions, deadline } = body;

    if (!taskId || !targetAgentId || !delegatingAgentId || !instructions) {
      return NextResponse.json(
        { error: 'Required: taskId, targetAgentId, delegatingAgentId, instructions' },
        { status: 400 }
      );
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    if (!task) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE tasks SET assigned_agent_id = ?, status = 'assigned',
        due_date = COALESCE(?, due_date), updated_at = ?
      WHERE id = ?
    `).run(targetAgentId, deadline || null, now, taskId);

    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, 'task_delegated', ?, ?, ?, ?)
    `).run(
      uuidv4(), delegatingAgentId, taskId,
      `${delegatingAgentId} delegated to ${targetAgentId}: ${instructions.slice(0, 200)}`,
      now
    );

    const meta = db.prepare('SELECT goal_id FROM kanban_card_meta WHERE task_id = ?')
      .get(taskId) as { goal_id: string } | undefined;

    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details)
      VALUES (?, ?, 'vividwalls', 'intention', 'intention_committed', 'task', ?, ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`, delegatingAgentId,
      taskId, `Delegated task to ${targetAgentId}`,
      JSON.stringify({ instructions, deadline })
    );

    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, 'agent_message', ?, ?, ?, ?)
    `).run(
      uuidv4(), targetAgentId, taskId,
      JSON.stringify({
        from: delegatingAgentId,
        to: targetAgentId,
        type: 'task_delegation',
        taskId,
        goalId: meta?.goal_id,
        instructions,
        deadline,
      }),
      now
    );

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_updated', payload: updated });

    return NextResponse.json({
      taskId,
      assignedTo: targetAgentId,
      delegatedBy: delegatingAgentId,
      status: 'assigned',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
