import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

/** Fire-and-forget rollup trigger after BDI stage changes */
function triggerRollup() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
  fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
    console.error('[BDI] Rollup trigger failed:', err)
  );
}

// GET /api/kanban/bdi-log — query BDI declarations
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const refTier = searchParams.get('refTier');
    const refId = searchParams.get('refId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = 'SELECT * FROM bdi_log WHERE 1=1';
    const params: unknown[] = [];

    if (agentId) { query += ' AND agent_id = ?'; params.push(agentId); }
    if (refTier) { query += ' AND ref_tier = ?'; params.push(refTier); }
    if (refId) { query += ' AND ref_id = ?'; params.push(refId); }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Math.min(limit, 200));

    const entries = db.prepare(query).all(...params);
    return NextResponse.json({ entries });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kanban/bdi-log — record a BDI declaration (agent emission endpoint)
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { agentId, businessId, bdiState, transitionType, refTier, refId, summary, details, confidence } = body;

    if (!agentId || !bdiState || !transitionType || !refTier || !refId || !summary) {
      return NextResponse.json({
        error: 'Required: agentId, bdiState, transitionType, refTier, refId, summary'
      }, { status: 400 });
    }

    const validStates = ['belief', 'desire', 'intention', 'action'];
    const validTransitions = ['desire_adopted', 'intention_committed', 'plan_selected', 'action_executed', 'goal_achieved', 'goal_dropped', 'belief_revised'];
    const validTiers = ['goal', 'campaign', 'initiative', 'task'];

    if (!validStates.includes(bdiState)) return NextResponse.json({ error: `Invalid bdiState: ${bdiState}` }, { status: 400 });
    if (!validTransitions.includes(transitionType)) return NextResponse.json({ error: `Invalid transitionType: ${transitionType}` }, { status: 400 });
    if (!validTiers.includes(refTier)) return NextResponse.json({ error: `Invalid refTier: ${refTier}` }, { status: 400 });

    const id = `bdi-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, agentId, businessId || 'vividwalls', bdiState, transitionType, refTier, refId, summary,
      details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
      confidence ?? null,
    );

    // Handle stage transitions for goal_achieved/goal_dropped across all tiers
    if (transitionType === 'goal_achieved' || transitionType === 'goal_dropped') {
      const newStage = transitionType === 'goal_achieved' ? 'done' : 'cancelled';
      const progressVal = transitionType === 'goal_achieved' ? 100 : undefined;

      const tierTableMap: Record<string, string> = {
        goal: 'kanban_goals',
        campaign: 'kanban_campaigns',
        initiative: 'kanban_initiatives',
      };
      const table = tierTableMap[refTier];
      if (table) {
        const existing = db.prepare(`SELECT stage, progress_pct FROM ${table} WHERE id = ?`).get(refId) as { stage: string; progress_pct: number } | undefined;
        if (existing && existing.stage !== newStage) {
          db.prepare(`UPDATE ${table} SET stage = ?, progress_pct = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(newStage, progressVal ?? existing.progress_pct, refId);
          db.prepare(`
            INSERT INTO stage_transitions (id, entity_tier, entity_id, from_stage, to_stage, agent_id, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(`st-${uuidv4().slice(0, 8)}`, refTier, refId, existing.stage, newStage, agentId, summary);
        }
      }

      // Trigger rollup after BDI stage change (non-blocking)
      triggerRollup();
    }

    // Handle intention_committed / action_executed → move to in_progress if backlog
    if (transitionType === 'intention_committed' || transitionType === 'action_executed') {
      const tierTableMap: Record<string, string> = {
        goal: 'kanban_goals',
        campaign: 'kanban_campaigns',
        initiative: 'kanban_initiatives',
      };
      const table = tierTableMap[refTier];
      if (table) {
        const existing = db.prepare(`SELECT stage FROM ${table} WHERE id = ?`).get(refId) as { stage: string } | undefined;
        if (existing && existing.stage === 'backlog') {
          db.prepare(`UPDATE ${table} SET stage = 'in_progress', updated_at = datetime('now') WHERE id = ?`)
            .run(refId);
          db.prepare(`
            INSERT INTO stage_transitions (id, entity_tier, entity_id, from_stage, to_stage, agent_id, reason)
            VALUES (?, ?, ?, 'backlog', 'in_progress', ?, ?)
          `).run(`st-${uuidv4().slice(0, 8)}`, refTier, refId, agentId, `BDI ${transitionType}: ${summary}`);
        }
      }
    }

    const entry = db.prepare('SELECT * FROM bdi_log WHERE id = ?').get(id);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
