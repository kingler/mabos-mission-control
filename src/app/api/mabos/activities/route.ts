import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 500);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    let query = 'SELECT * FROM agent_activities WHERE 1=1';
    const params: unknown[] = [];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    // Count total
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const { total } = db.prepare(countQuery).get(...params) as { total: number };

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const activities = db.prepare(query).all(...params);

    return NextResponse.json({ activities, total });
  } catch (error) {
    console.error('[API] Failed to fetch activities:', error);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}
