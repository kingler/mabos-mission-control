import { NextRequest, NextResponse } from 'next/server';
import { getScheduler } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scheduler
 *
 * Returns scheduler status: running, queue depth, last cycle results, stats.
 */
export async function GET() {
  const scheduler = getScheduler();
  return NextResponse.json(scheduler.getStatus());
}

/**
 * POST /api/scheduler
 *
 * Control the scheduler:
 *   { action: 'start' }                    — Start auto-dispatching on interval
 *   { action: 'stop' }                     — Stop auto-dispatching
 *   { action: 'run-once' }                 — Run a single dispatch cycle
 *   { action: 'configure', config: {...} } — Update scheduler config
 *
 * Config options:
 *   intervalMs: number          — Cycle interval (default: 300000 = 5 min)
 *   maxTasksPerAgent: number    — Max concurrent tasks per agent (default: 2)
 *   batchSize: number           — Tasks per cycle (default: 5)
 *   dispatchCooldownMs: number  — Delay between dispatches (default: 2000)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;

    const scheduler = getScheduler();

    switch (action) {
      case 'start':
        scheduler.start();
        return NextResponse.json({ success: true, message: 'Scheduler started', status: scheduler.getStatus() });

      case 'stop':
        scheduler.stop();
        return NextResponse.json({ success: true, message: 'Scheduler stopped', status: scheduler.getStatus() });

      case 'run-once': {
        const results = await scheduler.runOnce();
        return NextResponse.json({
          success: true,
          message: `Dispatch cycle complete: ${results.filter(r => r.success).length} dispatched, ${results.filter(r => !r.success).length} failed`,
          results,
          status: scheduler.getStatus(),
        });
      }

      case 'configure':
        if (!config || typeof config !== 'object') {
          return NextResponse.json({ error: 'Missing config object' }, { status: 400 });
        }
        scheduler.updateConfig(config);
        return NextResponse.json({ success: true, message: 'Configuration updated', status: scheduler.getStatus() });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use: start, stop, run-once, configure` },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
