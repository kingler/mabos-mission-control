import { NextRequest, NextResponse } from 'next/server';
import { MabosApiClient } from '@/lib/mabos/client';

const mabos = new MabosApiClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { resolution, optionId, feedback } = body;

    const result = await mabos.resolveDecision(params.id, {
      action: resolution === 'defer' ? 'defer' : 'approve',
      optionId,
      feedback,
    });

    return NextResponse.json({
      ok: result.ok,
      id: params.id,
      resolution,
      optionId,
      resolvedAt: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
