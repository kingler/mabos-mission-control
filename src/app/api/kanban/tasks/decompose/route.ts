import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface ProposedTask {
  title: string;
  description?: string;
  assignedAgentId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedDuration?: string;
  dependsOnIndex?: number;
}

interface DecomposeBody {
  goalId: string;
  campaignId?: string;
  initiativeId?: string;
  agentId: string;
  analysis?: string;
  proposedTasks: ProposedTask[];
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body: DecomposeBody = await request.json();
    const { goalId, campaignId, initiativeId, agentId, analysis, proposedTasks } = body;

    if (!goalId || !agentId || !proposedTasks?.length) {
      return NextResponse.json(
        { error: 'Required: goalId, agentId, proposedTasks (non-empty array)' },
        { status: 400 }
      );
    }

    if (proposedTasks.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 tasks per decomposition' }, { status: 400 });
    }

    const goal = db.prepare('SELECT id, business_id, domain FROM kanban_goals WHERE id = ?')
      .get(goalId) as { id: string; business_id: string; domain: string } | undefined;
    if (!goal) {
      return NextResponse.json({ error: `Goal ${goalId} not found` }, { status: 404 });
    }

    const now = new Date().toISOString();
    const createdTasks: { taskId: string; title: string; index: number }[] = [];

    const createAll = db.transaction(() => {
      const taskIds: string[] = [];
      for (let i = 0; i < proposedTasks.length; i++) {
        const pt = proposedTasks[i];
        const taskId = uuidv4();
        taskIds.push(taskId);
        const initialStatus = pt.assignedAgentId ? 'assigned' : 'inbox';

        db.prepare(`
          INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id,
            workspace_id, business_id, origin, estimated_duration, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'default', ?, 'mabos-agent', ?, ?, ?)
        `).run(
          taskId, pt.title, pt.description || null, initialStatus,
          pt.priority || 'normal', pt.assignedAgentId || null, agentId,
          goal.business_id, pt.estimatedDuration || null, now, now
        );

        db.prepare(`
          INSERT INTO kanban_card_meta (task_id, goal_id, campaign_id, initiative_id, meta_type, domain)
          VALUES (?, ?, ?, ?, 'operational', ?)
        `).run(taskId, goalId, campaignId || null, initiativeId || null, goal.domain);

        createdTasks.push({ taskId, title: pt.title, index: i });
      }

      for (let i = 0; i < proposedTasks.length; i++) {
        const pt = proposedTasks[i];
        if (pt.dependsOnIndex !== undefined && pt.dependsOnIndex >= 0 && pt.dependsOnIndex < i) {
          db.prepare('UPDATE tasks SET depends_on = ? WHERE id = ?')
            .run(taskIds[pt.dependsOnIndex], taskIds[i]);
        }
      }

      db.prepare(`
        INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details)
        VALUES (?, ?, ?, 'intention', 'plan_selected', ?, ?, ?, ?)
      `).run(
        `bdi-${uuidv4().slice(0, 8)}`, agentId, goal.business_id,
        initiativeId ? 'initiative' : (campaignId ? 'campaign' : 'goal'),
        initiativeId || campaignId || goalId,
        `Decomposed into ${proposedTasks.length} tasks`,
        analysis || null
      );
    });

    createAll();

    for (const ct of createdTasks) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(ct.taskId);
      broadcast({ type: 'task_created', payload: task });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
    fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
      console.error('[Decompose] Rollup trigger failed:', err)
    );

    return NextResponse.json({
      created: createdTasks.length,
      tasks: createdTasks,
      goalId,
      campaignId: campaignId || null,
      initiativeId: initiativeId || null,
    }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
