import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DecompositionStage } from '@/lib/types';

// GET /api/kanban/decomposition/[runId] — Full pipeline run with all stages + goal metadata
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const db = getDb();

    const stages = db.prepare(`
      SELECT * FROM decomposition_stages
      WHERE pipeline_run_id = ?
      ORDER BY stage_number ASC
    `).all(runId) as DecompositionStage[];

    if (stages.length === 0) {
      return NextResponse.json({ error: `Pipeline run ${runId} not found` }, { status: 404 });
    }

    const goalId = stages[0].goal_id;
    const goal = db.prepare(`
      SELECT id, title, description, domain, meta_type, stage, goal_type, owner_id, target_date
      FROM kanban_goals WHERE id = ?
    `).get(goalId) as Record<string, unknown> | undefined;

    const completedCount = stages.filter(s => s.status === 'completed').length;
    const failedCount = stages.filter(s => s.status === 'failed').length;
    const runningCount = stages.filter(s => s.status === 'running').length;

    return NextResponse.json({
      pipelineRunId: runId,
      goalId,
      goal: goal || null,
      stages,
      summary: {
        total: stages.length,
        completed: completedCount,
        failed: failedCount,
        running: runningCount,
        pending: stages.length - completedCount - failedCount - runningCount,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
