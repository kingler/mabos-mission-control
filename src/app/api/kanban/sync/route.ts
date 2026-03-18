import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

/**
 * POST /api/kanban/sync — Trigger full MABOS→MC goal sync + rollup
 * Called manually or by cron/heartbeat for live observation.
 */
export async function POST(_request: NextRequest) {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    const report = await mabos.syncEngine.syncAll();

    return NextResponse.json({
      ok: true,
      report,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 500 });
  }
}

/**
 * GET /api/kanban/sync — Get sync status
 */
export async function GET(_request: NextRequest) {
  try {
    const db = getDb();

    const syncStates = db.prepare('SELECT * FROM sync_state ORDER BY entity_type').all();
    const goalCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_goals').get() as { c: number }).c;
    const campaignCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_campaigns').get() as { c: number }).c;
    const initiativeCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_initiatives').get() as { c: number }).c;
    const taskLinkCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_card_meta').get() as { c: number }).c;

    return NextResponse.json({
      sync_states: syncStates,
      counts: {
        goals: goalCount,
        campaigns: campaignCount,
        initiatives: initiativeCount,
        task_links: taskLinkCount,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
