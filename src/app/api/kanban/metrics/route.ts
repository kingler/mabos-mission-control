import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/kanban/metrics — query kanban metrics
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const metricName = searchParams.get('metricName');
    const tier = searchParams.get('tier');
    const domain = searchParams.get('domain');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = 'SELECT * FROM kanban_metrics WHERE 1=1';
    const params: unknown[] = [];

    if (metricName) { query += ' AND metric_name = ?'; params.push(metricName); }
    if (tier) { query += ' AND tier = ?'; params.push(tier); }
    if (domain) { query += ' AND domain = ?'; params.push(domain); }

    query += ' ORDER BY period_end DESC LIMIT ?';
    params.push(Math.min(limit, 200));

    const metrics = db.prepare(query).all(...params);
    return NextResponse.json({ metrics });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/kanban/metrics — record a metric snapshot
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { businessId, metricName, metricValue, unit, tier, domain, periodStart, periodEnd, metadata } = body;

    if (!metricName || metricValue === undefined || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Required: metricName, metricValue, periodStart, periodEnd' }, { status: 400 });
    }

    const id = `km-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO kanban_metrics (id, business_id, metric_name, metric_value, unit, tier, domain, period_start, period_end, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, businessId || 'vividwalls', metricName, metricValue, unit || 'count',
      tier || null, domain || null, periodStart, periodEnd,
      metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
    );

    const metric = db.prepare('SELECT * FROM kanban_metrics WHERE id = ?').get(id);
    return NextResponse.json({ metric }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
