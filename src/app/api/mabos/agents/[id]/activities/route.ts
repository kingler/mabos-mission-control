import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    let query = 'SELECT * FROM agent_activities WHERE agent_id = ?';
    const queryParams: unknown[] = [agentId];

    if (category) {
      query += ' AND category = ?';
      queryParams.push(category);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(limit);

    const activities = db.prepare(query).all(...queryParams);

    // Category counts (last 24h)
    const categoryCounts = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM agent_activities
      WHERE agent_id = ? AND created_at > datetime('now', '-24 hours')
      GROUP BY category
    `).all(agentId) as { category: string; count: number }[];

    return NextResponse.json({
      activities,
      categoryCounts: Object.fromEntries(categoryCounts.map(c => [c.category, c.count])),
      total: activities.length,
    });
  } catch (error) {
    console.error('[API] Failed to fetch agent activities:', error);
    return NextResponse.json({ error: 'Failed to fetch agent activities' }, { status: 500 });
  }
}
