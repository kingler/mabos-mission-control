#!/usr/bin/env node
/**
 * Backfill Tasks Script
 *
 * Enriches all existing tasks with:
 *   - Detailed structured descriptions
 *   - Agent assignments (based on title keywords + domain)
 *   - Due dates (based on priority)
 *   - Priority (based on goal stage)
 *   - Estimated duration
 *
 * Run: node scripts/backfill-tasks.js [--dry-run]
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'mission-control.db');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Domain → Agent Mapping ─────────────────────────────────────────

const DOMAIN_AGENTS = {
  product:    { owner: 'mabos-coo', directors: ['mabos-product-mgr', 'mabos-creative-director'] },
  marketing:  { owner: 'mabos-cmo', directors: ['mabos-marketing-director', 'mabos-sales-director', 'mabos-creative-director'] },
  finance:    { owner: 'mabos-cfo', directors: [] },
  operations: { owner: 'mabos-coo', directors: ['mabos-fulfillment-mgr', 'mabos-inventory-mgr', 'mabos-cs-director'] },
  technology: { owner: 'mabos-cto', directors: ['mabos-knowledge'] },
  legal:      { owner: 'mabos-legal', directors: ['mabos-compliance-director'] },
  hr:         { owner: 'mabos-hr', directors: [] },
  strategy:   { owner: 'mabos-ceo', directors: ['mabos-strategy'] },
};

// ─── Task Assignment Rules ──────────────────────────────────────────

const TASK_ASSIGNMENT_RULES = [
  { keywords: ['pictorem', 'fulfillment', 'shipping', 'packaging', 'print order', 'order routing'], agentId: 'mabos-fulfillment-mgr' },
  { keywords: ['inventory', 'material', 'supplier', 'cogs', 'cost reduction', 'bulk discount', 'negotiate', 'cost structure', 'cost basis'], agentId: 'mabos-inventory-mgr' },
  { keywords: ['customer response', 'faq', 'support', 'escalation', 'inbox', 'auto-respond', 'return reason', 'feedback collection'], agentId: 'mabos-cs-director' },
  { keywords: ['artwork', 'art collection', 'curate', 'photography', 'mockup', 'room scene', 'certificate', 'lookbook', 'content calendar', 'size comparison', 'art-drop'], agentId: 'mabos-creative-director' },
  { keywords: ['product bundle', 'pricing structure', 'shopify store', 'landing page', 'size guide', 'upsell', 'cross-sell', 'a/b test', 'framing option', 'multi-panel', 'diptych', 'triptych', 'premium pricing', 'tiered pricing'], agentId: 'mabos-product-mgr' },
  { keywords: ['ad campaign', 'meta ad', 'google shopping', 'pinterest', 'retargeting', 'lookalike', 'roas', 'seo', 'blog', 'influencer', 'social media', 'organic social', 'referral program', 'email', 'subscriber', 'newsletter', 'nurture', 'abandoned cart', 'notification', 'announcement', 'art recommendation', 'loyalty', 'rewards', 'repeat purchase', 'retention'], agentId: 'mabos-marketing-director' },
  { keywords: ['b2b', 'commercial', 'hotel', 'office', 'outreach campaign', 'prospect', 'interior designer', 'vip', 'collector', 'waitlist'], agentId: 'mabos-sales-director' },
  { keywords: ['analytics', 'tracking', 'attribution', 'dashboard', 'p&l', 'ebitda', 'revenue model', 'forecast', 'conversion tracking', 'margin projection', 'revenue-per-agent'], agentId: 'mabos-cfo' },
  { keywords: ['quality', 'inspection', 'scoring rubric', 'quality check', 'compliance'], agentId: 'mabos-compliance-director' },
  { keywords: ['automation', 'api', 'integration', 'ar preview', 'ai generation', 'performance scoring', 'agent performance'], agentId: 'mabos-cto' },
  { keywords: ['competitor', 'research', 'trending', 'market analysis'], agentId: 'mabos-strategy' },
  { keywords: ['pricing', 'price point', 'margin target'], agentId: 'mabos-cfo' },
  { keywords: ['demand forecast', 'le demand', 'le collection', 'le release', 'le program', 'limited edition', 'le price'], agentId: 'mabos-product-mgr' },
  { keywords: ['order funnel', 'traffic source'], agentId: 'mabos-marketing-director' },
];

function resolveAgent(title, domain) {
  const lower = title.toLowerCase();
  for (const rule of TASK_ASSIGNMENT_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.agentId;
    }
  }
  const da = DOMAIN_AGENTS[domain];
  return da ? (da.directors[0] || da.owner) : 'mabos-coo';
}

// ─── Description Generation ─────────────────────────────────────────

const DESC_PATTERNS = [
  {
    test: /audit|analyze|review|assess|calculate|map current/i,
    gen: (title, goalTitle, domain) =>
      `**Analysis Task — ${domain} domain**\n\n` +
      `${title} as part of goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Gather current baseline data and metrics\n` +
      `- Identify gaps, bottlenecks, or opportunities\n` +
      `- Document findings with supporting data\n\n` +
      `**Deliverable:** Analysis report with actionable recommendations and baseline metrics for tracking improvement.`,
  },
  {
    test: /create|build|design|develop|implement|set up|launch|establish/i,
    gen: (title, goalTitle, domain) =>
      `**Build Task — ${domain} domain**\n\n` +
      `${title} to advance goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Define requirements and acceptance criteria\n` +
      `- Build/implement the deliverable\n` +
      `- Test and validate before deployment\n\n` +
      `**Deliverable:** Completed implementation ready for review, with documentation of setup and configuration.`,
  },
  {
    test: /research|investigate|identify|select/i,
    gen: (title, goalTitle, domain) =>
      `**Research Task — ${domain} domain**\n\n` +
      `${title} to inform goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Research and gather relevant data from multiple sources\n` +
      `- Compare options or approaches with pros/cons\n` +
      `- Provide recommendation with rationale\n\n` +
      `**Deliverable:** Research brief with findings, comparison matrix, and recommended next steps.`,
  },
  {
    test: /negotiate|propose|plan|prepare|define/i,
    gen: (title, goalTitle, domain) =>
      `**Planning Task — ${domain} domain**\n\n` +
      `${title} as part of goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Define objectives and constraints\n` +
      `- Draft plan/proposal with key milestones\n` +
      `- Get stakeholder input and alignment\n\n` +
      `**Deliverable:** Approved plan/proposal document with timeline and resource requirements.`,
  },
  {
    test: /optimize|improve|upgrade|reduce|increase/i,
    gen: (title, goalTitle, domain) =>
      `**Optimization Task — ${domain} domain**\n\n` +
      `${title} to improve metrics for goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Measure current baseline performance\n` +
      `- Identify and implement improvements\n` +
      `- Validate improvement with before/after metrics\n\n` +
      `**Deliverable:** Documented improvement with before/after metrics and ongoing monitoring plan.`,
  },
  {
    test: /order|test print|a\/b test/i,
    gen: (title, goalTitle, domain) =>
      `**Testing Task — ${domain} domain**\n\n` +
      `${title} to validate approach for goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Define test parameters and success criteria\n` +
      `- Execute test with controlled variables\n` +
      `- Analyze results and document findings\n\n` +
      `**Deliverable:** Test results with data-backed conclusions and recommended action.`,
  },
];

function generateDescription(title, goalTitle, domain) {
  const capDomain = domain.charAt(0).toUpperCase() + domain.slice(1);
  for (const p of DESC_PATTERNS) {
    if (p.test.test(title)) {
      return p.gen(title, goalTitle, capDomain);
    }
  }
  return (
    `**Task — ${capDomain} domain**\n\n` +
    `${title} contributing to goal: "${goalTitle}".\n\n` +
    `**Scope:**\n` +
    `- Complete the work described in the title\n` +
    `- Verify output meets quality standards\n` +
    `- Document results and any follow-up needed\n\n` +
    `**Deliverable:** Completed work product with verification and documentation.`
  );
}

// ─── Duration & Priority ────────────────────────────────────────────

function estimateDuration(title) {
  const lower = title.toLowerCase();
  if (/audit|analyze|review|assess/.test(lower)) return '4h';
  if (/research|investigate|identify/.test(lower)) return '6h';
  if (/build|develop|implement|create.*system|create.*engine|create.*model/.test(lower)) return '8h';
  if (/design|plan|prepare|define/.test(lower)) return '4h';
  if (/set up|configure|launch/.test(lower)) return '3h';
  if (/negotiate|propose/.test(lower)) return '2h';
  if (/optimize|improve|upgrade/.test(lower)) return '6h';
  if (/order|test print/.test(lower)) return '2h';
  if (/a\/b test/.test(lower)) return '4h';
  if (/create|make/.test(lower)) return '4h';
  return '4h';
}

function resolvePriority(title, goalStage) {
  const lower = title.toLowerCase();
  if (goalStage === 'in_progress') {
    if (/audit|set up|automate|order routing/.test(lower)) return 'high';
    return 'normal';
  }
  if (goalStage === 'ready') {
    if (/audit|analyze|research|map/.test(lower)) return 'high';
    return 'normal';
  }
  if (goalStage === 'backlog') return 'low';
  return 'normal';
}

function calculateDueDate(priority) {
  const now = new Date();
  const days = { urgent: 7, high: 14, normal: 30, low: 60 }[priority] || 30;
  now.setDate(now.getDate() + days);
  return now.toISOString().split('T')[0];
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  const db = new Database(DB_PATH);

  // Get all tasks with their goal info
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.description, t.assigned_agent_id, t.due_date, t.priority, t.estimated_duration,
           kcm.goal_id, kcm.domain,
           g.title as goal_title, g.stage as goal_stage, g.target_date as goal_target_date
    FROM tasks t
    LEFT JOIN kanban_card_meta kcm ON t.id = kcm.task_id
    LEFT JOIN kanban_goals g ON kcm.goal_id = g.id
    ORDER BY kcm.goal_id, t.title
  `).all();

  console.log(`Found ${tasks.length} tasks to process`);

  const updateStmt = db.prepare(`
    UPDATE tasks
    SET description = ?,
        assigned_agent_id = ?,
        due_date = ?,
        priority = ?,
        estimated_duration = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  let updated = 0;
  let skipped = 0;

  const runUpdates = db.transaction(() => {
    for (const task of tasks) {
      const domain = task.domain || 'operations';
      const goalTitle = task.goal_title || 'VividWalls Launch';
      const goalStage = task.goal_stage || 'backlog';

      // Only backfill missing fields
      const needsUpdate = !task.description || !task.assigned_agent_id || !task.due_date;
      if (!needsUpdate) {
        skipped++;
        continue;
      }

      const description = task.description || generateDescription(task.title, goalTitle, domain);
      const assignedAgentId = task.assigned_agent_id || resolveAgent(task.title, domain);
      const priority = task.priority || resolvePriority(task.title, goalStage);
      const dueDate = task.due_date || calculateDueDate(priority);
      const estimatedDuration = task.estimated_duration || estimateDuration(task.title);

      if (DRY_RUN) {
        console.log(`\n[DRY RUN] Task: ${task.title}`);
        console.log(`  Agent: ${assignedAgentId}`);
        console.log(`  Priority: ${priority}`);
        console.log(`  Due: ${dueDate}`);
        console.log(`  Duration: ${estimatedDuration}`);
        console.log(`  Description: ${description.substring(0, 80)}...`);
      } else {
        updateStmt.run(description, assignedAgentId, dueDate, priority, estimatedDuration, task.id);
      }
      updated++;
    }
  });

  runUpdates();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total tasks: ${tasks.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already had data): ${skipped}`);
  if (DRY_RUN) console.log(`\n(Dry run — no changes written. Remove --dry-run to apply.)`);

  db.close();
}

main();
