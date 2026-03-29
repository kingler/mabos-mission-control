import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { bootstrapCoreAgents, cloneWorkflowTemplates } from '@/lib/bootstrap-agents';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      businessName, businessType, industry, description,
      companyStage, currentRevenue, teamSize, keyProducts,
      primaryChannels, constraints, vision, mission,
      coreValues, bmc,
    } = body;

    if (!businessName || !businessType || !industry || !description) {
      return NextResponse.json(
        { error: 'Required: businessName, businessType, industry, description' },
        { status: 400 }
      );
    }

    const db = getDb();

    // 1. Create workspace
    const workspaceId = crypto.randomUUID();
    let slug = generateSlug(businessName);

    // Ensure slug uniqueness
    const existingSlug = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(slug);
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    db.prepare(`
      INSERT INTO workspaces (id, name, slug, description, icon)
      VALUES (?, ?, ?, ?, ?)
    `).run(workspaceId, businessName.trim(), slug, description, '🏢');

    // Clone workflow templates and bootstrap core agents
    cloneWorkflowTemplates(db, workspaceId);
    bootstrapCoreAgents(workspaceId);

    // 2. Create business profile
    const profileId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO business_profiles (
        id, workspace_id, business_type, industry, description,
        company_stage, current_revenue, team_size, key_products,
        primary_channels, constraints, vision, mission,
        core_values, bmc_data, onboarding_completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      profileId, workspaceId, businessType, industry, description,
      companyStage || 'startup', currentRevenue || null, teamSize || 1,
      keyProducts || null, primaryChannels || null, constraints || null,
      vision || null, mission || null,
      coreValues ? JSON.stringify(coreValues) : null,
      bmc ? JSON.stringify(bmc) : null,
    );

    return NextResponse.json({
      workspaceId,
      profileId,
      slug,
    }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Onboarding Complete]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
