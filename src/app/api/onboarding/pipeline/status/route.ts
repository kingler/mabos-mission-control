import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    if (!runId) {
      return NextResponse.json({ error: 'Required query param: runId' }, { status: 400 });
    }

    const db = getDb();
    const stages = db.prepare(`
      SELECT stage_number, stage_name, status, error_message, started_at, completed_at
      FROM decomposition_stages
      WHERE pipeline_run_id = ?
      ORDER BY stage_number
    `).all(runId) as {
      stage_number: number;
      stage_name: string;
      status: string;
      error_message: string | null;
      started_at: string | null;
      completed_at: string | null;
    }[];

    if (stages.length === 0) {
      return NextResponse.json({ error: `Pipeline run ${runId} not found` }, { status: 404 });
    }

    const completed = stages.filter(s => s.status === 'completed').length;
    const failed = stages.filter(s => s.status === 'failed').length;
    const running = stages.filter(s => s.status === 'running').length;

    return NextResponse.json({
      runId,
      stages,
      progress: { completed, failed, running, total: stages.length },
      isComplete: completed === stages.length,
      hasFailed: failed > 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
