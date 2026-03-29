import { NextRequest, NextResponse } from 'next/server';
import { MabosApiClient } from '@/lib/mabos/client';
import { extractJSON } from '@/lib/planning-utils';

const GENERATION_PROMPTS: Record<string, (ctx: Record<string, string>) => { system: string; user: string }> = {
  vision: (ctx) => ({
    system: 'You are a strategic business advisor. Generate a compelling, aspirational vision statement for the company described below. Return ONLY the vision statement text, no JSON, no quotes, no preamble.',
    user: `Company: ${ctx.businessName}\nType: ${ctx.businessType}\nIndustry: ${ctx.industry}\nDescription: ${ctx.description}\nStage: ${ctx.companyStage}\n\nGenerate a 1-2 sentence vision statement that captures the long-term aspirational goal.`,
  }),
  mission: (ctx) => ({
    system: 'You are a strategic business advisor. Generate a clear, actionable mission statement for the company described below. Return ONLY the mission statement text, no JSON, no quotes, no preamble.',
    user: `Company: ${ctx.businessName}\nType: ${ctx.businessType}\nIndustry: ${ctx.industry}\nDescription: ${ctx.description}\nVision: ${ctx.vision}\n\nGenerate a 1-2 sentence mission statement that describes what the company does, for whom, and how.`,
  }),
  values: (ctx) => ({
    system: 'You are a strategic business advisor. Generate core values for the company. Return ONLY a JSON array of 5-7 value strings. Example: ["Innovation","Customer Obsession","Quality"]',
    user: `Company: ${ctx.businessName}\nType: ${ctx.businessType}\nIndustry: ${ctx.industry}\nDescription: ${ctx.description}\nVision: ${ctx.vision}\nMission: ${ctx.mission}\n\nGenerate 5-7 core values as a JSON array of strings.`,
  }),
  bmc_block: (ctx) => ({
    system: `You are a business model canvas expert. Generate content for the "${ctx.blockName}" block of the Business Model Canvas. Return 3-5 bullet points as a single string with line breaks. No JSON, no markdown formatting, just plain text bullet points starting with "- ".`,
    user: `Company: ${ctx.businessName}\nType: ${ctx.businessType}\nIndustry: ${ctx.industry}\nDescription: ${ctx.description}\nVision: ${ctx.vision}\nMission: ${ctx.mission}\n\nGenerate the "${ctx.blockName}" section of the Business Model Canvas.`,
  }),
};

export async function POST(request: NextRequest) {
  try {
    const { type, context, blockName } = await request.json();

    if (!type || !context) {
      return NextResponse.json({ error: 'Required: type, context' }, { status: 400 });
    }

    const promptFn = GENERATION_PROMPTS[type];
    if (!promptFn) {
      return NextResponse.json({ error: `Unknown generation type: ${type}` }, { status: 400 });
    }

    const ctx = { ...context, blockName: blockName || '' };
    const { system, user } = promptFn(ctx);

    // Call MABOS gateway LLM endpoint
    const client = new MabosApiClient();
    const response = await client.getStatus(); // Test connectivity first

    // Use direct fetch to the gateway's chat endpoint
    const baseUrl = process.env.MABOS_API_URL || 'http://127.0.0.1:18789';
    const authToken = process.env.OPENCLAW_GATEWAY_TOKEN;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const llmRes = await fetch(`${baseUrl}/mabos/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!llmRes.ok) {
      const errBody = await llmRes.text().catch(() => '');
      return NextResponse.json(
        { error: `LLM call failed: ${llmRes.status} ${errBody}` },
        { status: 502 }
      );
    }

    const llmData = await llmRes.json();
    const text = llmData.content || llmData.response || llmData.message?.content || '';

    // For values type, parse as JSON array
    if (type === 'values') {
      const parsed = extractJSON(text);
      if (Array.isArray(parsed)) {
        return NextResponse.json({ result: parsed });
      }
      // Try to extract array from text
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          return NextResponse.json({ result: JSON.parse(arrMatch[0]) });
        } catch { /* fall through */ }
      }
      return NextResponse.json({ result: text });
    }

    return NextResponse.json({ result: text.trim() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Onboarding Generate]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
