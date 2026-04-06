import { NextRequest, NextResponse } from 'next/server';
import { MabosApiClient } from '@/lib/mabos/client';

const mabos = new MabosApiClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const urgency = searchParams.get('urgency');

    let decisions = await mabos.getDecisions();

    if (urgency) {
      decisions = decisions.filter(d => d.urgency === urgency);
    }

    return NextResponse.json({ decisions, total: decisions.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
