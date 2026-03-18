import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    // Try live data first
    try {
      const jobs = await mabos.client.getCronJobs(mabos.getBusinessId());
      const filtered = agentId ? jobs.filter(j => j.agentId === agentId) : jobs;
      return NextResponse.json({ jobs: filtered });
    } catch {
      // Fallback to cached
      let query = 'SELECT * FROM mabos_cron_jobs WHERE business_id = ?';
      const params: unknown[] = [mabos.getBusinessId()];

      if (agentId) {
        query += ' AND agent_id = ?';
        params.push(agentId);
      }

      query += ' ORDER BY name';
      const cached = db.prepare(query).all(...params);
      return NextResponse.json({ jobs: cached, cached: true });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch cron jobs' }, { status: 500 });
  }
}
