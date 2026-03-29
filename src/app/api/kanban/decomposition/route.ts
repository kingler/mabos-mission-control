import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

const STAGE_NAMES = [
  'business_goal_generation',
  'goal_refinement',
  'project_scoping',
  'plan_generation',
  'task_decomposition',
  'subtask_action_generation',
  'execution_plan_assembly',
] as const;

// POST /api/kanban/decomposition — Create a new pipeline run (7 pending rows)
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const { goalId, agentId } = await request.json();

    if (!goalId || !agentId) {
      return NextResponse.json(
        { error: 'Required: goalId, agentId' },
        { status: 400 }
      );
    }

    const goal = db.prepare('SELECT id FROM kanban_goals WHERE id = ?').get(goalId) as { id: string } | undefined;
    if (!goal) {
      return NextResponse.json({ error: `Goal ${goalId} not found` }, { status: 404 });
    }

    const pipelineRunId = `run-${uuidv4().slice(0, 12)}`;

    const insertStages = db.transaction(() => {
      for (let i = 0; i < STAGE_NAMES.length; i++) {
        db.prepare(`
          INSERT INTO decomposition_stages (id, goal_id, pipeline_run_id, stage_number, stage_name, status, agent_id)
          VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `).run(
          `ds-${uuidv4().slice(0, 8)}`,
          goalId,
          pipelineRunId,
          i + 1,
          STAGE_NAMES[i],
          agentId
        );
      }
    });

    insertStages();

    return NextResponse.json({ pipelineRunId, goalId, stages: 7 }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/kanban/decomposition?goalId=X — List pipeline runs for a goal
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');

    if (!goalId) {
      return NextResponse.json({ error: 'Required query param: goalId' }, { status: 400 });
    }

    const runs = db.prepare(`
      SELECT DISTINCT pipeline_run_id,
        goal_id,
        MIN(created_at) as started_at,
        MAX(CASE WHEN status = 'completed' THEN completed_at END) as last_completed_at,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        COUNT(*) as total_stages
      FROM decomposition_stages
      WHERE goal_id = ?
      GROUP BY pipeline_run_id
      ORDER BY MIN(created_at) DESC
    `).all(goalId);

    return NextResponse.json(runs);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
