import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/kanban/rollup — Recalculate progress rollup
 * Tasks → Initiatives → Campaigns → Goals
 */
export async function POST(_request: NextRequest) {
  try {
    const db = getDb();
    const updates: string[] = [];

    // 1. Initiative progress = avg of linked task completion
    const initiatives = db.prepare('SELECT id FROM kanban_initiatives').all() as { id: string }[];
    for (const init of initiatives) {
      const stats = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done
        FROM kanban_card_meta m JOIN tasks t ON t.id = m.task_id
        WHERE m.initiative_id = ?
      `).get(init.id) as { total: number; done: number };

      if (stats.total > 0) {
        const pct = Math.round((stats.done / stats.total) * 100);
        db.prepare("UPDATE kanban_initiatives SET progress_pct = ?, updated_at = datetime('now') WHERE id = ?")
          .run(pct, init.id);
        updates.push(`initiative ${init.id}: ${pct}%`);
      }
    }

    // 2. Campaign progress = avg of initiative progress
    const campaigns = db.prepare('SELECT id FROM kanban_campaigns').all() as { id: string }[];
    for (const camp of campaigns) {
      const avg = db.prepare(`
        SELECT AVG(progress_pct) as avg_pct, COUNT(*) as cnt
        FROM kanban_initiatives WHERE campaign_id = ?
      `).get(camp.id) as { avg_pct: number | null; cnt: number };

      if (avg.cnt > 0 && avg.avg_pct != null) {
        const pct = Math.round(avg.avg_pct);
        db.prepare("UPDATE kanban_campaigns SET progress_pct = ?, updated_at = datetime('now') WHERE id = ?")
          .run(pct, camp.id);
        updates.push(`campaign ${camp.id}: ${pct}%`);
      }
    }

    // 3. Goal progress = avg of campaign progress (or task-based if no campaigns)
    const goals = db.prepare('SELECT id FROM kanban_goals').all() as { id: string }[];
    for (const goal of goals) {
      const campAvg = db.prepare(`
        SELECT AVG(progress_pct) as avg_pct, COUNT(*) as cnt
        FROM kanban_campaigns WHERE goal_id = ?
      `).get(goal.id) as { avg_pct: number | null; cnt: number };

      let pct = 0;
      if (campAvg.cnt > 0 && campAvg.avg_pct != null) {
        pct = Math.round(campAvg.avg_pct);
      } else {
        // Fallback: direct task completion under goal
        const taskStats = db.prepare(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done
          FROM kanban_card_meta m JOIN tasks t ON t.id = m.task_id
          WHERE m.goal_id = ?
        `).get(goal.id) as { total: number; done: number };
        if (taskStats.total > 0) {
          pct = Math.round((taskStats.done / taskStats.total) * 100);
        }
      }

      db.prepare("UPDATE kanban_goals SET progress_pct = ?, updated_at = datetime('now') WHERE id = ?")
        .run(pct, goal.id);
      updates.push(`goal ${goal.id}: ${pct}%`);
    }

    // 4. Snapshot metrics
    const now = new Date().toISOString().split('T')[0];
    const totalGoals = goals.length;
    const activeGoals = db.prepare("SELECT COUNT(*) as c FROM kanban_goals WHERE stage = 'in_progress'").get() as { c: number };
    const totalBdi = db.prepare("SELECT COUNT(*) as c FROM bdi_log WHERE created_at >= datetime('now', '-24 hours')").get() as { c: number };

    // uuid imported at top level
    for (const [name, value] of [
      ['active_goals', activeGoals.c],
      ['total_goals', totalGoals],
      ['bdi_events_24h', totalBdi.c],
    ] as [string, number][]) {
      db.prepare(`
        INSERT INTO kanban_metrics (id, business_id, metric_name, metric_value, unit, period_start, period_end)
        VALUES (?, 'vividwalls', ?, ?, 'count', ?, ?)
      `).run(`km-${uuidv4().slice(0, 8)}`, name, value, now, now);
    }

    return NextResponse.json({ rollup: updates, metrics_snapshotted: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/kanban/rollup — Get rollup summary
 */
export async function GET(_request: NextRequest) {
  try {
    const db = getDb();

    const goals = db.prepare(`
      SELECT id, title, stage, progress_pct, domain,
        (SELECT COUNT(*) FROM kanban_campaigns c WHERE c.goal_id = g.id) as campaigns,
        (SELECT COUNT(*) FROM kanban_initiatives i WHERE i.goal_id = g.id) as initiatives,
        (SELECT COUNT(*) FROM kanban_card_meta m WHERE m.goal_id = g.id) as tasks,
        (SELECT COUNT(*) FROM kanban_card_meta m JOIN tasks t ON t.id = m.task_id WHERE m.goal_id = g.id AND t.status = 'done') as done_tasks
      FROM kanban_goals g ORDER BY priority
    `).all();

    const bdi24h = db.prepare(`
      SELECT bdi_state, COUNT(*) as cnt FROM bdi_log
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY bdi_state
    `).all() as { bdi_state: string; cnt: number }[];

    const agentActivity = db.prepare(`
      SELECT agent_id, COUNT(*) as cnt FROM bdi_log
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY agent_id ORDER BY cnt DESC LIMIT 10
    `).all();

    const recentTransitions = db.prepare(`
      SELECT * FROM stage_transitions ORDER BY created_at DESC LIMIT 10
    `).all();

    return NextResponse.json({
      goals,
      bdi_summary_24h: Object.fromEntries(bdi24h.map(b => [b.bdi_state, b.cnt])),
      agent_activity_24h: agentActivity,
      recent_transitions: recentTransitions,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
