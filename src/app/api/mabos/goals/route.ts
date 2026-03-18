import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMabosIntegration } from '@/lib/mabos';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const mabos = getMabosIntegration(db);
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId') || mabos.getBusinessId();

    const goals = await mabos.client.getGoals(businessId);
    return NextResponse.json(goals);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
