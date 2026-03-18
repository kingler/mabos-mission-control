import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/kanban/seed-mabos-goals
 *
 * Syncs the MABOS 42-goal TypeDB hierarchy into Mission Control's kanban tables:
 *   12 Strategic (G-S*) → kanban_goals    (Tier 1)
 *   15 Tactical  (G-T*) → kanban_campaigns (Tier 2)
 *   15 Operational(G-O*)→ kanban_initiatives (Tier 3)
 *
 * Idempotent: uses INSERT OR REPLACE. Safe to run multiple times.
 */

// ── Agent → Domain mapping ──────────────────────────────────────────

const AGENT_DOMAIN: Record<string, string> = {
  'vw-ceo': 'strategy',
  'vw-cfo': 'finance',
  'vw-cmo': 'marketing',
  'vw-cto': 'technology',
  'vw-coo': 'operations',
  'vw-hr': 'hr',
  'vw-legal': 'legal',
  'vw-knowledge': 'strategy',
  'vw-strategy': 'strategy',
  'vw-inventory-mgr': 'operations',
  'vw-fulfillment-mgr': 'operations',
  'vw-product-mgr': 'product',
  'vw-marketing-director': 'marketing',
  'vw-sales-director': 'marketing',
  'vw-compliance-director': 'legal',
  'vw-creative-director': 'product',
  'vw-cs-director': 'operations',
};

// Map MABOS seed agent IDs (vw-*) to Mission Control agent IDs (mabos-*)
const AGENT_MC_ID: Record<string, string> = {
  'vw-ceo': 'mabos-ceo',
  'vw-cfo': 'mabos-cfo',
  'vw-cmo': 'mabos-cmo',
  'vw-cto': 'mabos-cto',
  'vw-coo': 'mabos-coo',
  'vw-hr': 'mabos-hr',
  'vw-legal': 'mabos-legal',
  'vw-knowledge': 'mabos-knowledge',
  'vw-strategy': 'mabos-strategy',
  'vw-inventory-mgr': 'mabos-inventory-mgr',
  'vw-fulfillment-mgr': 'mabos-fulfillment-mgr',
  'vw-product-mgr': 'mabos-product-mgr',
  'vw-marketing-director': 'mabos-marketing-director',
  'vw-sales-director': 'mabos-sales-director',
  'vw-compliance-director': 'mabos-compliance-director',
  'vw-creative-director': 'mabos-creative-director',
  'vw-cs-director': 'mabos-cs-director',
};

const BUSINESS_ID = 'vividwalls';

// ── Strategic Goals → kanban_goals (Tier 1) ─────────────────────────

interface StrategicGoal {
  id: string;
  agentId: string;
  name: string;
  description: string;
  priority: number;
  deadline?: string;
  success_criteria?: string;
  goal_type?: string;
}

const STRATEGIC_GOALS: StrategicGoal[] = [
  {
    id: 'G-S001', agentId: 'vw-cfo',
    name: 'Reach $13.7M Revenue by Year 5',
    description: 'Grow VividWalls from $2.3M to $13.7M annual revenue across consumer, designer, and commercial segments',
    priority: 1, deadline: '2030-12-31', success_criteria: 'Annual revenue >= $13.7M', goal_type: 'achieve',
  },
  {
    id: 'G-S002', agentId: 'vw-cfo',
    name: 'Achieve 26% EBITDA Margin by Year 5',
    description: 'Improve profitability from -12% to 26% EBITDA margin through scale and cost optimization',
    priority: 2, deadline: '2030-12-31', success_criteria: 'EBITDA margin >= 26%', goal_type: 'achieve',
  },
  {
    id: 'G-S003', agentId: 'vw-cmo',
    name: 'Grow to 18,767 Orders/Year by Year 5',
    description: 'Scale order volume from 3,833 to 18,767 orders annually',
    priority: 3, deadline: '2030-12-31', success_criteria: 'Annual orders >= 18,767', goal_type: 'achieve',
  },
  {
    id: 'G-S004', agentId: 'vw-cmo',
    name: 'Reach $730 Average Order Value by Year 5',
    description: 'Increase AOV from $600 to $730 through upselling and premium products',
    priority: 4, deadline: '2030-12-31', success_criteria: 'AOV >= $730', goal_type: 'achieve',
  },
  {
    id: 'G-S005', agentId: 'vw-cmo',
    name: 'Achieve 45% Repeat Purchase Rate',
    description: 'Build customer loyalty from 25% to 45% repeat purchase rate',
    priority: 5, deadline: '2030-12-31', success_criteria: 'Repeat rate >= 45%', goal_type: 'achieve',
  },
  {
    id: 'G-S006', agentId: 'vw-cmo',
    name: 'Reduce CAC to $60',
    description: 'Halve customer acquisition cost from $120 to $60 through organic and referral growth',
    priority: 6, deadline: '2030-12-31', success_criteria: 'CAC <= $60', goal_type: 'achieve',
  },
  {
    id: 'G-S007', agentId: 'vw-cmo',
    name: 'Scale Limited Edition to 20% Revenue Mix',
    description: 'Grow limited edition share from 10% to 20% of total revenue with 50% price premium',
    priority: 7, deadline: '2030-12-31', success_criteria: 'LE revenue mix >= 20%', goal_type: 'achieve',
  },
  {
    id: 'G-S008', agentId: 'vw-ceo',
    name: 'Expand to International Markets',
    description: 'Launch in EU and Asia markets by Year 4-5',
    priority: 8, deadline: '2030-12-31', success_criteria: 'Active in >= 3 international markets', goal_type: 'achieve',
  },
  {
    id: 'G-S009', agentId: 'vw-cto',
    name: 'Launch AR Preview Technology',
    description: 'Develop augmented reality wall art preview feature for customers',
    priority: 9, deadline: '2028-12-31', success_criteria: 'AR feature live in production', goal_type: 'achieve',
  },
  {
    id: 'G-S010', agentId: 'vw-cto',
    name: 'Build Proprietary AI Art Generation',
    description: 'Create custom AI art generation service for unique VividWalls collections',
    priority: 10, deadline: '2030-12-31', success_criteria: 'AI generation MVP launched', goal_type: 'achieve',
  },
  {
    id: 'G-S011', agentId: 'vw-coo',
    name: 'Open Physical Showroom',
    description: 'Establish physical showroom in major metropolitan market',
    priority: 11, deadline: '2030-12-31', success_criteria: 'Showroom open and operational', goal_type: 'achieve',
  },
  {
    id: 'G-S012', agentId: 'vw-coo',
    name: 'Achieve $1.14M Revenue Per Employee',
    description: 'Increase employee productivity from $460K to $1.14M revenue per employee',
    priority: 12, deadline: '2030-12-31', success_criteria: 'Rev/employee >= $1.14M', goal_type: 'achieve',
  },
];

// ── Tactical Goals → kanban_campaigns (Tier 2) ──────────────────────

interface TacticalGoal {
  id: string;
  agentId: string;
  name: string;
  description: string;
  priority: number;
  deadline?: string;
  success_criteria?: string;
  parent_goal_id: string; // Strategic goal ID
  goal_type?: string;
}

const TACTICAL_GOALS: TacticalGoal[] = [
  {
    id: 'G-T001', agentId: 'vw-cfo',
    name: 'Reach $2.3M Revenue Year 1',
    description: 'Achieve first year revenue target of $2.3M',
    priority: 1, deadline: '2026-12-31', success_criteria: 'Y1 revenue >= $2.3M',
    parent_goal_id: 'G-S001', goal_type: 'achieve',
  },
  {
    id: 'G-T002', agentId: 'vw-cfo',
    name: 'Reach $4.0M Revenue Year 2',
    description: 'Achieve 74% growth to $4.0M in second year',
    priority: 2, deadline: '2027-12-31', success_criteria: 'Y2 revenue >= $4.0M',
    parent_goal_id: 'G-S001', goal_type: 'achieve',
  },
  {
    id: 'G-T003', agentId: 'vw-cfo',
    name: 'Achieve Positive EBITDA by Year 2',
    description: 'Move from -12% to 11% EBITDA margin',
    priority: 3, deadline: '2027-12-31', success_criteria: 'EBITDA > 0',
    parent_goal_id: 'G-S002', goal_type: 'achieve',
  },
  {
    id: 'G-T004', agentId: 'vw-coo',
    name: 'Process 3,833 Orders Year 1',
    description: 'Build fulfillment capacity for 319 orders/month',
    priority: 4, deadline: '2026-12-31', success_criteria: 'Y1 orders >= 3,833',
    parent_goal_id: 'G-S003', goal_type: 'achieve',
  },
  {
    id: 'G-T005', agentId: 'vw-cmo',
    name: 'Maintain $600 AOV Year 1',
    description: 'Establish baseline AOV at $600 across all segments',
    priority: 5, deadline: '2026-12-31', success_criteria: 'AOV >= $600',
    parent_goal_id: 'G-S004', goal_type: 'maintain',
  },
  {
    id: 'G-T006', agentId: 'vw-cmo',
    name: 'Achieve 25% Repeat Purchase Rate Year 1',
    description: 'Build initial customer loyalty and retention',
    priority: 6, deadline: '2026-12-31', success_criteria: 'Repeat rate >= 25%',
    parent_goal_id: 'G-S005', goal_type: 'achieve',
  },
  {
    id: 'G-T007', agentId: 'vw-cmo',
    name: 'Reduce CAC to $120 Year 1',
    description: 'Optimize marketing spend efficiency in first year',
    priority: 7, deadline: '2026-12-31', success_criteria: 'CAC <= $120',
    parent_goal_id: 'G-S006', goal_type: 'achieve',
  },
  {
    id: 'G-T008', agentId: 'vw-cmo',
    name: 'Launch LE Program at 10% Mix',
    description: 'Establish limited edition program with initial 10% revenue share',
    priority: 8, deadline: '2026-12-31', success_criteria: 'LE mix >= 10%',
    parent_goal_id: 'G-S007', goal_type: 'achieve',
  },
  {
    id: 'G-T009', agentId: 'vw-cmo',
    name: 'Achieve 35% LE Price Premium Year 1',
    description: 'Price limited editions at 35% above standard prints',
    priority: 9, deadline: '2026-12-31', success_criteria: 'LE premium >= 35%',
    parent_goal_id: 'G-S007', goal_type: 'maintain',
  },
  {
    id: 'G-T010', agentId: 'vw-cto',
    name: 'Research AR Preview Feasibility',
    description: 'Evaluate AR technology options and build proof-of-concept',
    priority: 10, deadline: '2027-06-30', success_criteria: 'Feasibility report delivered',
    parent_goal_id: 'G-S009', goal_type: 'query',
  },
  {
    id: 'G-T011', agentId: 'vw-cmo',
    name: 'Grow Consumer Segment to 65% Revenue',
    description: 'Build individual art collector customer base as primary revenue driver',
    priority: 11, deadline: '2026-12-31', success_criteria: 'Consumer revenue >= 65%',
    parent_goal_id: 'G-S003', goal_type: 'achieve',
  },
  {
    id: 'G-T012', agentId: 'vw-cmo',
    name: 'Build Designer Segment to 25% Revenue',
    description: 'Develop interior designer trade program partnerships',
    priority: 12, deadline: '2027-12-31', success_criteria: 'Designer revenue >= 25%',
    parent_goal_id: 'G-S003', goal_type: 'achieve',
  },
  {
    id: 'G-T013', agentId: 'vw-cmo',
    name: 'Develop Commercial Segment to 15% Revenue',
    description: 'Build B2B commercial accounts for hotels, offices, healthcare',
    priority: 13, deadline: '2027-12-31', success_criteria: 'Commercial revenue >= 15%',
    parent_goal_id: 'G-S003', goal_type: 'achieve',
  },
  {
    id: 'G-T014', agentId: 'vw-coo',
    name: 'Optimize Fulfillment to <7 Days',
    description: 'Streamline order-to-delivery pipeline',
    priority: 14, deadline: '2026-12-31', success_criteria: 'Avg fulfillment <= 7 days',
    parent_goal_id: 'G-S012', goal_type: 'achieve',
  },
  {
    id: 'G-T015', agentId: 'vw-coo',
    name: 'Reduce COGS from 60% to 55% Year 2',
    description: 'Improve gross margins through scale and supplier negotiations',
    priority: 15, deadline: '2027-12-31', success_criteria: 'COGS <= 55%',
    parent_goal_id: 'G-S002', goal_type: 'achieve',
  },
];

// ── Operational Goals → kanban_initiatives (Tier 3) ─────────────────

interface OperationalGoal {
  id: string;
  agentId: string;
  name: string;
  description: string;
  priority: number;
  deadline?: string;
  success_criteria?: string;
  parent_goal_id: string; // Tactical goal ID
  goal_type?: string;
}

const OPERATIONAL_GOALS: OperationalGoal[] = [
  {
    id: 'G-O001', agentId: 'vw-cfo',
    name: 'Generate $192K Monthly Revenue',
    description: 'Maintain monthly revenue run-rate of $192K to hit $2.3M annual target',
    priority: 1, deadline: 'ongoing', success_criteria: 'Monthly revenue >= $192K',
    parent_goal_id: 'G-T001', goal_type: 'maintain',
  },
  {
    id: 'G-O002', agentId: 'vw-coo',
    name: 'Fulfill 319 Orders/Month',
    description: 'Process and ship average 319 orders per month',
    priority: 2, deadline: 'ongoing', success_criteria: 'Monthly orders >= 319',
    parent_goal_id: 'G-T004', goal_type: 'maintain',
  },
  {
    id: 'G-O003', agentId: 'vw-cmo',
    name: 'Maintain $600 AOV Across Channels',
    description: 'Monitor and optimize AOV across web, social, and partner channels',
    priority: 3, deadline: 'ongoing', success_criteria: 'Rolling 30-day AOV >= $600',
    parent_goal_id: 'G-T005', goal_type: 'maintain',
  },
  {
    id: 'G-O004', agentId: 'vw-cmo',
    name: 'Run Monthly Email Retention Campaigns',
    description: 'Execute targeted email campaigns for customer retention and repeat purchases',
    priority: 4, deadline: 'ongoing', success_criteria: '1 campaign/month, 30%+ open rate',
    parent_goal_id: 'G-T006', goal_type: 'maintain',
  },
  {
    id: 'G-O005', agentId: 'vw-cmo',
    name: 'Optimize Ad Spend to <$120/Acquisition',
    description: 'Manage Facebook, Instagram, Pinterest ad budgets for CAC efficiency',
    priority: 5, deadline: 'ongoing', success_criteria: 'Blended CAC <= $120',
    parent_goal_id: 'G-T007', goal_type: 'maintain',
  },
  {
    id: 'G-O006', agentId: 'vw-cmo',
    name: 'Curate First 3 Limited Edition Collections',
    description: 'Select and launch initial LE collections with numbered certificates',
    priority: 6, deadline: '2026-06-30', success_criteria: '3 LE collections launched',
    parent_goal_id: 'G-T008', goal_type: 'achieve',
  },
  {
    id: 'G-O007', agentId: 'vw-coo',
    name: 'Produce 50-100 Prints Per LE Run',
    description: 'Manage limited edition print runs at 50-100 units with quality control',
    priority: 7, deadline: 'ongoing', success_criteria: 'Each LE run 50-100 units',
    parent_goal_id: 'G-T008', goal_type: 'maintain',
  },
  {
    id: 'G-O008', agentId: 'vw-cmo',
    name: 'Price LEs at 35% Premium Over Standard',
    description: 'Set and maintain limited edition pricing at 35% above standard prints',
    priority: 8, deadline: 'ongoing', success_criteria: 'LE price premium >= 35%',
    parent_goal_id: 'G-T009', goal_type: 'maintain',
  },
  {
    id: 'G-O009', agentId: 'vw-coo',
    name: 'Maintain <24hr Customer Response Time',
    description: 'Respond to all customer inquiries within 24 hours',
    priority: 9, deadline: 'ongoing', success_criteria: 'Avg response time < 24hrs',
    parent_goal_id: 'G-T014', goal_type: 'maintain',
  },
  {
    id: 'G-O010', agentId: 'vw-coo',
    name: 'Achieve 95%+ Print Quality Score',
    description: 'Maintain 300+ DPI, 95%+ color accuracy on all prints',
    priority: 10, deadline: 'ongoing', success_criteria: 'Quality score >= 95%',
    parent_goal_id: 'G-T014', goal_type: 'maintain',
  },
  {
    id: 'G-O011', agentId: 'vw-coo',
    name: 'Negotiate Bulk Material Discounts',
    description: 'Secure volume discounts with canvas, ink, and framing suppliers',
    priority: 11, deadline: '2026-09-30', success_criteria: '>=10% discount on bulk orders',
    parent_goal_id: 'G-T015', goal_type: 'achieve',
  },
  {
    id: 'G-O012', agentId: 'vw-cmo',
    name: 'Run Facebook/Instagram/Pinterest Campaigns',
    description: 'Execute weekly social media advertising across 3 platforms',
    priority: 12, deadline: 'ongoing', success_criteria: 'Active campaigns on 3 platforms',
    parent_goal_id: 'G-T011', goal_type: 'maintain',
  },
  {
    id: 'G-O013', agentId: 'vw-cmo',
    name: 'Recruit 50 Interior Designer Partners',
    description: 'Build trade program with 50 active designer accounts',
    priority: 13, deadline: '2026-12-31', success_criteria: '>=50 designer accounts',
    parent_goal_id: 'G-T012', goal_type: 'achieve',
  },
  {
    id: 'G-O014', agentId: 'vw-cmo',
    name: 'Close 5 Commercial Accounts',
    description: 'Sign 5 commercial clients (hotels, offices, healthcare facilities)',
    priority: 14, deadline: '2026-12-31', success_criteria: '>=5 commercial accounts',
    parent_goal_id: 'G-T013', goal_type: 'achieve',
  },
  {
    id: 'G-O015', agentId: 'vw-coo',
    name: 'Reduce Return Rate to <5%',
    description: 'Minimize returns through quality assurance and accurate product imagery',
    priority: 15, deadline: 'ongoing', success_criteria: 'Return rate < 5%',
    parent_goal_id: 'G-T015', goal_type: 'avoid',
  },
];

// ── Tactical → Strategic parent lookup (for initiative.goal_id) ─────

function getStrategicParent(tacticalId: string): string {
  const tactical = TACTICAL_GOALS.find(t => t.id === tacticalId);
  return tactical?.parent_goal_id || 'G-S001';
}

// ── GET: Show current sync status ───────────────────────────────────

export async function GET() {
  try {
    const db = getDb();
    const goalCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_goals WHERE business_id = ?').get(BUSINESS_ID) as { c: number }).c;
    const campaignCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_campaigns WHERE business_id = ?').get(BUSINESS_ID) as { c: number }).c;
    const initiativeCount = (db.prepare('SELECT COUNT(*) as c FROM kanban_initiatives WHERE business_id = ?').get(BUSINESS_ID) as { c: number }).c;

    const mabosGoals = db.prepare("SELECT id, title, stage FROM kanban_goals WHERE business_id = ? AND id LIKE 'G-S%'").all(BUSINESS_ID);
    const mabosLinked = mabosGoals.length > 0;

    return NextResponse.json({
      status: mabosLinked ? 'synced' : 'unsynced',
      counts: { goals: goalCount, campaigns: campaignCount, initiatives: initiativeCount },
      expected: { goals: 12, campaigns: 15, initiatives: 15 },
      mabosGoalIds: mabosGoals.map((g: any) => g.id),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// ── POST: Seed/sync MABOS goals into kanban tables ──────────────────

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    // Check if already seeded
    const existing = (db.prepare("SELECT COUNT(*) as c FROM kanban_goals WHERE business_id = ? AND id LIKE 'G-S%'").get(BUSINESS_ID) as { c: number }).c;
    if (existing > 0 && !force) {
      return NextResponse.json({
        message: 'MABOS goals already synced. Pass { "force": true } to reseed.',
        existing,
      }, { status: 409 });
    }

    // Use a transaction for atomicity
    const seedAll = db.transaction(() => {
      // 1. Remove old placeholder goals (vw-g01..vw-g04) and their children
      //    Also remove any existing MABOS goals if force-reseeding
      db.prepare("DELETE FROM kanban_card_meta WHERE goal_id IN (SELECT id FROM kanban_goals WHERE business_id = ?)").run(BUSINESS_ID);
      db.prepare("DELETE FROM kanban_initiatives WHERE business_id = ?").run(BUSINESS_ID);
      db.prepare("DELETE FROM kanban_campaigns WHERE business_id = ?").run(BUSINESS_ID);
      db.prepare("DELETE FROM kanban_goals WHERE business_id = ?").run(BUSINESS_ID);

      // 2. Insert Strategic Goals → kanban_goals
      const insertGoal = db.prepare(`
        INSERT INTO kanban_goals (id, business_id, title, description, meta_type, domain, stage, owner_id, priority, target_date, progress_pct, kpi_definition, tags)
        VALUES (?, ?, ?, ?, 'strategic', ?, 'backlog', ?, ?, ?, 0, ?, ?)
      `);

      for (const g of STRATEGIC_GOALS) {
        const domain = AGENT_DOMAIN[g.agentId] || 'strategy';
        const ownerId = AGENT_MC_ID[g.agentId] || null;
        insertGoal.run(
          g.id, BUSINESS_ID, g.name, g.description,
          domain, ownerId, g.priority,
          g.deadline === 'ongoing' ? null : g.deadline || null,
          g.success_criteria ? JSON.stringify({ criteria: g.success_criteria, type: g.goal_type }) : null,
          JSON.stringify([g.goal_type || 'achieve']),
        );
      }

      // 3. Insert Tactical Goals → kanban_campaigns
      const insertCampaign = db.prepare(`
        INSERT INTO kanban_campaigns (id, goal_id, business_id, title, description, meta_type, domain, stage, owner_id, priority, end_date, progress_pct, tags)
        VALUES (?, ?, ?, ?, ?, 'tactical', ?, 'backlog', ?, ?, ?, 0, ?)
      `);

      for (const t of TACTICAL_GOALS) {
        const domain = AGENT_DOMAIN[t.agentId] || 'strategy';
        const ownerId = AGENT_MC_ID[t.agentId] || null;
        insertCampaign.run(
          t.id, t.parent_goal_id, BUSINESS_ID, t.name, t.description,
          domain, ownerId, t.priority,
          t.deadline === 'ongoing' ? null : t.deadline || null,
          JSON.stringify([t.goal_type || 'achieve']),
        );
      }

      // 4. Insert Operational Goals → kanban_initiatives
      const insertInitiative = db.prepare(`
        INSERT INTO kanban_initiatives (id, campaign_id, goal_id, business_id, title, description, meta_type, domain, stage, owner_id, priority, end_date, progress_pct, tags)
        VALUES (?, ?, ?, ?, ?, ?, 'operational', ?, 'backlog', ?, ?, ?, 0, ?)
      `);

      for (const o of OPERATIONAL_GOALS) {
        const domain = AGENT_DOMAIN[o.agentId] || 'strategy';
        const ownerId = AGENT_MC_ID[o.agentId] || null;
        const strategicParent = getStrategicParent(o.parent_goal_id);
        insertInitiative.run(
          o.id, o.parent_goal_id, strategicParent, BUSINESS_ID,
          o.name, o.description,
          domain, ownerId, o.priority,
          o.deadline === 'ongoing' ? null : o.deadline || null,
          JSON.stringify([o.goal_type || 'maintain']),
        );
      }

      return {
        goals: STRATEGIC_GOALS.length,
        campaigns: TACTICAL_GOALS.length,
        initiatives: OPERATIONAL_GOALS.length,
      };
    });

    const counts = seedAll();

    return NextResponse.json({
      message: 'MABOS goals synced to kanban',
      seeded: counts,
      hierarchy: {
        'Tier 1 (Goals)': `${counts.goals} Strategic Goals (G-S001–G-S012)`,
        'Tier 2 (Campaigns)': `${counts.campaigns} Tactical Goals (G-T001–G-T015)`,
        'Tier 3 (Initiatives)': `${counts.initiatives} Operational Goals (G-O001–G-O015)`,
      },
    }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
