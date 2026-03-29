import { NextResponse } from 'next/server';
import { getTypeDBClient, MCGoalQueries, MCFactQueries, parseAnswers } from '@/lib/typedb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/typedb/health
 * Returns TypeDB connectivity status and basic counts.
 */
export async function GET() {
  const client = getTypeDBClient();

  try {
    const health = await client.healthCheck();

    if (!health.available) {
      return NextResponse.json({
        available: false,
        database: health.database,
        message: 'TypeDB is not reachable. MC continues with SQLite.',
      });
    }

    let goalCount = 0;
    let factCount = 0;

    try {
      const goalResult = await client.matchQuery(MCGoalQueries.countGoals());
      if (goalResult) {
        const answers = parseAnswers(goalResult);
        if (answers[0]?.data?.count) {
          goalCount = Number(answers[0].data.count.value) || 0;
        }
      }
    } catch {
      // Count query may fail if schema not loaded
    }

    try {
      const factResult = await client.matchQuery(MCFactQueries.countFacts());
      if (factResult) {
        const answers = parseAnswers(factResult);
        if (answers[0]?.data?.count) {
          factCount = Number(answers[0].data.count.value) || 0;
        }
      }
    } catch {
      // Count query may fail if schema not loaded
    }

    return NextResponse.json({
      available: true,
      database: health.database,
      databases: health.databases,
      goalCount,
      factCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        database: process.env.TYPEDB_DATABASE || 'mabos',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
