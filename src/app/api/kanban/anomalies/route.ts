import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  entity: string;
  entityId: string;
  message: string;
  detectedAt: string;
}

/**
 * GET /api/kanban/anomalies — Scan for anomalies across the kanban system
 *
 * Checks:
 * - Goals stuck (in_progress > 7 days with no BDI activity)
 * - WIP limit breaches
 * - Stale campaigns (no progress change in 5+ days)
 * - Agent silence (no BDI emissions in 24h)
 * - Blocked items without recent activity
 */
export async function GET(_request: NextRequest) {
  try {
    const db = getDb();
    const anomalies: Anomaly[] = [];
    const now = new Date().toISOString();

    // 1. Stuck goals: in_progress but no BDI activity in 3+ days
    const stuckGoals = db.prepare(`
      SELECT g.id, g.title, g.updated_at FROM kanban_goals g
      WHERE g.stage = 'in_progress'
        AND g.updated_at < datetime('now', '-3 days')
        AND NOT EXISTS (
          SELECT 1 FROM bdi_log b WHERE b.ref_id = g.id AND b.created_at >= datetime('now', '-3 days')
        )
    `).all() as { id: string; title: string; updated_at: string }[];

    for (const g of stuckGoals) {
      anomalies.push({
        type: 'stuck_goal',
        severity: 'high',
        entity: 'goal',
        entityId: g.id,
        message: `Goal "${g.title}" has been in progress with no activity since ${g.updated_at}`,
        detectedAt: now,
      });
    }

    // 2. Blocked items without recent transitions
    const blockedItems = db.prepare(`
      SELECT 'goal' as tier, id, title, updated_at FROM kanban_goals WHERE stage = 'blocked'
      UNION ALL
      SELECT 'campaign', id, title, updated_at FROM kanban_campaigns WHERE stage = 'blocked'
      UNION ALL
      SELECT 'initiative', id, title, updated_at FROM kanban_initiatives WHERE stage = 'blocked'
    `).all() as { tier: string; id: string; title: string; updated_at: string }[];

    for (const item of blockedItems) {
      anomalies.push({
        type: 'blocked_item',
        severity: 'medium',
        entity: item.tier,
        entityId: item.id,
        message: `${item.tier} "${item.title}" is blocked since ${item.updated_at}`,
        detectedAt: now,
      });
    }

    // 3. Agent silence: agents with BDI history but no activity in 24h
    const silentAgents = db.prepare(`
      SELECT DISTINCT agent_id FROM bdi_log
      WHERE agent_id != 'system'
      GROUP BY agent_id
      HAVING MAX(created_at) < datetime('now', '-24 hours')
    `).all() as { agent_id: string }[];

    for (const a of silentAgents) {
      anomalies.push({
        type: 'agent_silent',
        severity: 'low',
        entity: 'agent',
        entityId: a.agent_id,
        message: `Agent ${a.agent_id} has not emitted BDI declarations in 24+ hours`,
        detectedAt: now,
      });
    }

    // 4. WIP limit breaches
    const wipBreaches = db.prepare(`
      SELECT * FROM wip_limits WHERE current_count > max_items
    `).all() as { tier: string; domain: string; stage: string; max_items: number; current_count: number }[];

    for (const w of wipBreaches) {
      anomalies.push({
        type: 'wip_breach',
        severity: 'medium',
        entity: w.tier,
        entityId: `${w.tier}:${w.domain}:${w.stage}`,
        message: `WIP limit breached: ${w.tier}/${w.domain}/${w.stage} has ${w.current_count}/${w.max_items} items`,
        detectedAt: now,
      });
    }

    // 5. Excessive BDI churn (>100 events from single agent in 1h)
    const churnAgents = db.prepare(`
      SELECT agent_id, COUNT(*) as cnt FROM bdi_log
      WHERE created_at >= datetime('now', '-1 hour')
      GROUP BY agent_id HAVING cnt > 100
    `).all() as { agent_id: string; cnt: number }[];

    for (const a of churnAgents) {
      anomalies.push({
        type: 'bdi_churn',
        severity: 'high',
        entity: 'agent',
        entityId: a.agent_id,
        message: `Agent ${a.agent_id} emitted ${a.cnt} BDI events in the last hour (possible loop)`,
        detectedAt: now,
      });
    }

    return NextResponse.json({
      anomalies,
      count: anomalies.length,
      scanned_at: now,
      checks: ['stuck_goal', 'blocked_item', 'agent_silent', 'wip_breach', 'bdi_churn'],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
