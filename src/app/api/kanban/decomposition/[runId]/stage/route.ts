import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

// PUT /api/kanban/decomposition/[runId]/stage — Update a stage
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const db = getDb();
    const body = await request.json();
    const { stageNumber, status, outputJson, errorMessage } = body;

    if (!stageNumber || !status) {
      return NextResponse.json(
        { error: 'Required: stageNumber, status' },
        { status: 400 }
      );
    }

    const validStatuses = ['pending', 'running', 'completed', 'failed', 'skipped'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const stage = db.prepare(`
      SELECT * FROM decomposition_stages
      WHERE pipeline_run_id = ? AND stage_number = ?
    `).get(runId, stageNumber) as { id: string; goal_id: string; stage_name: string } | undefined;

    if (!stage) {
      return NextResponse.json(
        { error: `Stage ${stageNumber} not found in run ${runId}` },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    const updateFields: string[] = ['status = ?'];
    const updateValues: (string | null)[] = [status];

    if (outputJson !== undefined) {
      updateFields.push('output_json = ?');
      updateValues.push(typeof outputJson === 'string' ? outputJson : JSON.stringify(outputJson));
    }

    if (errorMessage !== undefined) {
      updateFields.push('error_message = ?');
      updateValues.push(errorMessage);
    }

    if (status === 'running') {
      updateFields.push('started_at = ?');
      updateValues.push(now);
    }

    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      updateFields.push('completed_at = ?');
      updateValues.push(now);
    }

    updateValues.push(stage.id);

    db.prepare(`
      UPDATE decomposition_stages
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).run(...updateValues);

    // Update goal_type if Stage 2 completed with goal_type in output
    if (stageNumber === 2 && status === 'completed' && outputJson) {
      try {
        const output = typeof outputJson === 'string' ? JSON.parse(outputJson) : outputJson;
        if (output.goal_type) {
          db.prepare('UPDATE kanban_goals SET goal_type = ? WHERE id = ?')
            .run(output.goal_type, stage.goal_id);
        }
      } catch { /* ignore parse errors */ }
    }

    // Insert activity log for linked tasks
    const linkedTasks = db.prepare(`
      SELECT t.id FROM tasks t
      JOIN kanban_card_meta m ON m.task_id = t.id
      WHERE m.goal_id = ? AND t.decomposition_run_id = ?
    `).all(stage.goal_id, runId) as { id: string }[];

    for (const task of linkedTasks) {
      db.prepare(`
        INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
        VALUES (?, ?, 'status_changed', ?, ?)
      `).run(
        `act-${uuidv4().slice(0, 8)}`,
        task.id,
        `Pipeline stage ${stageNumber} (${stage.stage_name}) ${status}`,
        now
      );
    }

    // Broadcast SSE
    broadcast({
      type: 'decomposition_stage_updated',
      payload: {
        pipelineRunId: runId,
        stageNumber,
        stageName: stage.stage_name,
        status,
        goalId: stage.goal_id,
      },
    } as any);

    return NextResponse.json({ success: true, stageId: stage.id, status });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
