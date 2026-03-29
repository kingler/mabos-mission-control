/**
 * Kanban Entity Templates
 *
 * Provides structured templates for generating Goals, Plans (Campaigns),
 * Tasks, and Actions (Initiatives) with required fields:
 *   - Detailed descriptions
 *   - Agent assignments (via domain→agent mapping)
 *   - Due dates (calculated from parent target dates)
 *   - Priority, estimated duration, KPIs
 *
 * Usage:
 *   import { DOMAIN_AGENTS, goalTemplate, campaignTemplate, taskTemplate, initiativeTemplate } from './templates';
 *   const goal = goalTemplate({ title: '...', domain: 'marketing', ... });
 */

import type {
  KanbanDomain,
  MetaType,
  KanbanStage,
} from '@/lib/types/kanban';

// ─── Domain → Agent Mapping ─────────────────────────────────────────

/** Maps each kanban domain to the primary owner agent and supporting agents */
export const DOMAIN_AGENTS: Record<KanbanDomain, {
  owner: string;         // Primary agent ID (C-suite or domain lead)
  ownerName: string;
  directors: string[];   // Domain directors/managers
  supporting: string[];  // Agents that contribute but don't own
}> = {
  product: {
    owner: 'mabos-coo',
    ownerName: 'COO Agent',
    directors: ['mabos-product-mgr', 'mabos-creative-director'],
    supporting: ['mabos-cto', 'mabos-inventory-mgr'],
  },
  marketing: {
    owner: 'mabos-cmo',
    ownerName: 'CMO Agent',
    directors: ['mabos-marketing-director', 'mabos-sales-director', 'mabos-creative-director'],
    supporting: ['mabos-ceo', 'mabos-cfo'],
  },
  finance: {
    owner: 'mabos-cfo',
    ownerName: 'CFO Agent',
    directors: [],
    supporting: ['mabos-ceo', 'mabos-coo'],
  },
  operations: {
    owner: 'mabos-coo',
    ownerName: 'COO Agent',
    directors: ['mabos-fulfillment-mgr', 'mabos-inventory-mgr', 'mabos-cs-director'],
    supporting: ['mabos-cto', 'mabos-product-mgr'],
  },
  technology: {
    owner: 'mabos-cto',
    ownerName: 'CTO Agent',
    directors: ['mabos-knowledge'],
    supporting: ['mabos-ceo', 'mabos-coo'],
  },
  legal: {
    owner: 'mabos-legal',
    ownerName: 'Legal Agent',
    directors: ['mabos-compliance-director'],
    supporting: ['mabos-ceo', 'mabos-hr'],
  },
  hr: {
    owner: 'mabos-hr',
    ownerName: 'HR Agent',
    directors: [],
    supporting: ['mabos-ceo', 'mabos-coo'],
  },
  strategy: {
    owner: 'mabos-ceo',
    ownerName: 'CEO Agent',
    directors: ['mabos-strategy'],
    supporting: ['mabos-cfo', 'mabos-cmo'],
  },
};

// ─── Task → Agent Assignment Rules ──────────────────────────────────

/** Keyword-based agent assignment for tasks. Order matters — first match wins. */
const TASK_ASSIGNMENT_RULES: { keywords: string[]; agentId: string }[] = [
  // Fulfillment & Pictorem
  { keywords: ['pictorem', 'fulfillment', 'shipping', 'packaging', 'print order', 'order routing'], agentId: 'mabos-fulfillment-mgr' },
  // Inventory & materials
  { keywords: ['inventory', 'material', 'supplier', 'COGS', 'cost reduction', 'bulk discount', 'negotiate'], agentId: 'mabos-inventory-mgr' },
  // Customer service
  { keywords: ['customer response', 'FAQ', 'support', 'escalation', 'inbox', 'auto-respond', 'return reason', 'feedback collection'], agentId: 'mabos-cs-director' },
  // Creative & art
  { keywords: ['artwork', 'art collection', 'curate', 'photography', 'mockup', 'room scene', 'certificate', 'design', 'lookbook', 'content calendar'], agentId: 'mabos-creative-director' },
  // Product management
  { keywords: ['product bundle', 'pricing structure', 'Shopify store', 'landing page', 'size guide', 'upsell', 'cross-sell', 'A/B test'], agentId: 'mabos-product-mgr' },
  // Marketing & ads
  { keywords: ['ad campaign', 'Meta ad', 'Google Shopping', 'Pinterest', 'retargeting', 'lookalike', 'ROAS', 'SEO', 'blog', 'influencer', 'social media', 'organic social', 'referral program'], agentId: 'mabos-marketing-director' },
  // Sales
  { keywords: ['B2B', 'commercial', 'hotel', 'office', 'outreach campaign', 'prospect', 'interior designer', 'VIP', 'collector', 'waitlist'], agentId: 'mabos-sales-director' },
  // Email marketing
  { keywords: ['email', 'subscriber', 'newsletter', 'nurture', 'abandoned cart', 'notification', 'announcement'], agentId: 'mabos-marketing-director' },
  // Analytics & tracking
  { keywords: ['analytics', 'tracking', 'attribution', 'dashboard', 'P&L', 'EBITDA', 'revenue model', 'forecast', 'conversion tracking'], agentId: 'mabos-cfo' },
  // Quality & compliance
  { keywords: ['quality', 'inspection', 'scoring rubric', 'quality check', 'compliance'], agentId: 'mabos-compliance-director' },
  // Tech & automation
  { keywords: ['automation', 'API', 'integration', 'AR preview', 'AI generation', 'performance scoring', 'agent performance'], agentId: 'mabos-cto' },
  // Competitor & market research
  { keywords: ['competitor', 'research', 'trending', 'market analysis'], agentId: 'mabos-strategy' },
  // Loyalty & retention
  { keywords: ['loyalty', 'rewards', 'repeat purchase', 'retention', 'recommendation engine'], agentId: 'mabos-marketing-director' },
  // Pricing & cost analysis
  { keywords: ['pricing', 'cost basis', 'margin', 'price point'], agentId: 'mabos-cfo' },
];

/**
 * Resolve the best agent for a task based on its title, domain, and optional keywords.
 * Falls back to the domain owner if no keyword match.
 */
export function resolveTaskAgent(title: string, domain: KanbanDomain): string {
  const lower = title.toLowerCase();
  for (const rule of TASK_ASSIGNMENT_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return rule.agentId;
    }
  }
  // Fallback: first director if available, else domain owner
  const domainAgents = DOMAIN_AGENTS[domain];
  return domainAgents.directors[0] || domainAgents.owner;
}

// ─── Due Date Calculation ───────────────────────────────────────────

/**
 * Calculate a due date for a task based on the parent goal's target date
 * and the task's estimated duration. If no target date, defaults to
 * 30/60/90 days from now based on priority.
 */
export function calculateDueDate(opts: {
  parentTargetDate?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimatedDuration?: string;
  offsetWeeks?: number;
}): string {
  const now = new Date();

  if (opts.parentTargetDate) {
    // Work backward from target date
    const target = new Date(opts.parentTargetDate);
    // Leave buffer: urgent = 1 week before, high = 2 weeks, normal = 4 weeks, low = target date
    const bufferDays = { urgent: 7, high: 14, normal: 28, low: 0 }[opts.priority];
    target.setDate(target.getDate() - bufferDays);
    // Apply offset if tasks need staggering
    if (opts.offsetWeeks) {
      target.setDate(target.getDate() - opts.offsetWeeks * 7);
    }
    return target.toISOString().split('T')[0];
  }

  // No parent target — use priority-based defaults
  const daysFromNow = { urgent: 7, high: 14, normal: 30, low: 60 }[opts.priority];
  now.setDate(now.getDate() + daysFromNow);
  return now.toISOString().split('T')[0];
}

// ─── Description Generation ─────────────────────────────────────────

/** Generate a structured goal description from its attributes */
export function generateGoalDescription(opts: {
  title: string;
  domain: KanbanDomain;
  metaType: MetaType;
  kpiDefinition?: string;
  targetDate?: string;
}): string {
  const domainLabel = opts.domain.charAt(0).toUpperCase() + opts.domain.slice(1);
  const typeLabel = opts.metaType.charAt(0).toUpperCase() + opts.metaType.slice(1);

  const lines = [
    `**${typeLabel} Goal — ${domainLabel} Domain**`,
    '',
    `${opts.title}.`,
    '',
    '**Success Criteria:**',
  ];

  if (opts.kpiDefinition) {
    lines.push(`- ${opts.kpiDefinition}`);
  } else {
    lines.push('- [Define measurable KPI for this goal]');
  }

  if (opts.targetDate) {
    lines.push(`- Target completion: ${opts.targetDate}`);
  }

  lines.push('', '**Owner:** ' + DOMAIN_AGENTS[opts.domain].ownerName);
  lines.push('**Supporting:** ' + DOMAIN_AGENTS[opts.domain].directors
    .map(id => id.replace('mabos-', '').replace(/-/g, ' '))
    .join(', '));

  return lines.join('\n');
}

// ─── Task Description Templates ─────────────────────────────────────

/** Task category patterns for generating structured descriptions */
const TASK_DESCRIPTION_PATTERNS: {
  keywords: string[];
  template: (title: string, goalTitle: string, domain: string) => string;
}[] = [
  {
    keywords: ['audit', 'analyze', 'review', 'assess'],
    template: (title, goalTitle, domain) =>
      `**Analysis Task — ${domain} domain**\n\n` +
      `${title} as part of goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Gather current baseline data and metrics\n` +
      `- Identify gaps, bottlenecks, or opportunities\n` +
      `- Document findings with supporting data\n\n` +
      `**Deliverable:** Analysis report with actionable recommendations and baseline metrics for tracking improvement.`,
  },
  {
    keywords: ['create', 'build', 'design', 'develop', 'implement', 'set up', 'launch'],
    template: (title, goalTitle, domain) =>
      `**Build Task — ${domain} domain**\n\n` +
      `${title} to advance goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Define requirements and acceptance criteria\n` +
      `- Build/implement the deliverable\n` +
      `- Test and validate before deployment\n\n` +
      `**Deliverable:** Completed implementation ready for review, with documentation of setup and configuration.`,
  },
  {
    keywords: ['research', 'investigate', 'identify', 'map', 'select'],
    template: (title, goalTitle, domain) =>
      `**Research Task — ${domain} domain**\n\n` +
      `${title} to inform goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Research and gather relevant data from multiple sources\n` +
      `- Compare options or approaches with pros/cons\n` +
      `- Provide recommendation with rationale\n\n` +
      `**Deliverable:** Research brief with findings, comparison matrix, and recommended next steps.`,
  },
  {
    keywords: ['negotiate', 'propose', 'plan', 'prepare', 'define', 'establish'],
    template: (title, goalTitle, domain) =>
      `**Planning Task — ${domain} domain**\n\n` +
      `${title} as part of goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Define objectives and constraints\n` +
      `- Draft plan/proposal with key milestones\n` +
      `- Get stakeholder input and alignment\n\n` +
      `**Deliverable:** Approved plan/proposal document with timeline and resource requirements.`,
  },
  {
    keywords: ['optimize', 'improve', 'upgrade', 'reduce', 'increase'],
    template: (title, goalTitle, domain) =>
      `**Optimization Task — ${domain} domain**\n\n` +
      `${title} to improve metrics for goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Measure current baseline performance\n` +
      `- Identify and implement improvements\n` +
      `- Validate improvement with before/after metrics\n\n` +
      `**Deliverable:** Documented improvement with before/after metrics and ongoing monitoring plan.`,
  },
  {
    keywords: ['order', 'test print', 'A/B test'],
    template: (title, goalTitle, domain) =>
      `**Testing Task — ${domain} domain**\n\n` +
      `${title} to validate approach for goal: "${goalTitle}".\n\n` +
      `**Scope:**\n` +
      `- Define test parameters and success criteria\n` +
      `- Execute test with controlled variables\n` +
      `- Analyze results and document findings\n\n` +
      `**Deliverable:** Test results with data-backed conclusions and recommended action.`,
  },
];

/** Generate a structured task description based on title keywords */
export function generateTaskDescription(
  title: string,
  goalTitle: string,
  domain: KanbanDomain,
): string {
  const lower = title.toLowerCase();
  const domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);

  for (const pattern of TASK_DESCRIPTION_PATTERNS) {
    if (pattern.keywords.some(kw => lower.includes(kw))) {
      return pattern.template(title, goalTitle, domainLabel);
    }
  }

  // Generic fallback
  return (
    `**Task — ${domainLabel} domain**\n\n` +
    `${title} contributing to goal: "${goalTitle}".\n\n` +
    `**Scope:**\n` +
    `- Complete the work described in the title\n` +
    `- Verify output meets quality standards\n` +
    `- Document results and any follow-up needed\n\n` +
    `**Deliverable:** Completed work product with verification and documentation.`
  );
}

// ─── Estimated Duration Rules ───────────────────────────────────────

/** Estimate task duration based on title keywords */
export function estimateTaskDuration(title: string): string {
  const lower = title.toLowerCase();
  if (/audit|analyze|review|assess/.test(lower)) return '4h';
  if (/research|investigate|identify/.test(lower)) return '6h';
  if (/build|develop|implement|create.*system|create.*engine|create.*model/.test(lower)) return '8h';
  if (/design|plan|prepare|define/.test(lower)) return '4h';
  if (/set up|configure|launch/.test(lower)) return '3h';
  if (/negotiate|propose/.test(lower)) return '2h';
  if (/optimize|improve|upgrade/.test(lower)) return '6h';
  if (/order|test print/.test(lower)) return '2h';
  if (/A\/B test/.test(lower)) return '4h';
  if (/create|make/.test(lower)) return '4h';
  return '4h';
}

// ─── Expected Deliverable Extraction ─────────────────────────────────

/** Extract expected deliverable metadata from task title and goal context */
export function extractExpectedDeliverable(
  title: string,
  goalTitle: string,
  domain: string,
): { title: string; description: string } {
  const lower = title.toLowerCase();

  if (/audit|analyze|review|assess/.test(lower)) {
    return {
      title: `${title} — Analysis Report`,
      description: `Analysis report for "${goalTitle}" in ${domain} domain with findings and recommendations.`,
    };
  }
  if (/create|build|design|develop|implement|set up|launch/.test(lower)) {
    return {
      title: `${title} — Completed Deliverable`,
      description: `Completed implementation for "${goalTitle}" in ${domain} domain, ready for review.`,
    };
  }
  if (/research|investigate|identify|map|select/.test(lower)) {
    return {
      title: `${title} — Research Findings`,
      description: `Research findings and recommendations for "${goalTitle}" in ${domain} domain.`,
    };
  }
  if (/negotiate|propose|plan|prepare|define|establish/.test(lower)) {
    return {
      title: `${title} — Plan Document`,
      description: `Planning document or proposal for "${goalTitle}" in ${domain} domain.`,
    };
  }
  if (/optimize|improve|upgrade/.test(lower)) {
    return {
      title: `${title} — Optimization Report`,
      description: `Before/after metrics and improvement documentation for "${goalTitle}" in ${domain} domain.`,
    };
  }

  return {
    title: `${title} — Work Product`,
    description: `Completed work product for "${goalTitle}" in ${domain} domain.`,
  };
}

// ─── Priority Resolution ────────────────────────────────────────────

/** Determine task priority from title keywords and goal stage */
export function resolveTaskPriority(
  title: string,
  goalStage: KanbanStage,
): 'low' | 'normal' | 'high' | 'urgent' {
  const lower = title.toLowerCase();

  // In-progress goals get higher priority tasks
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

// ─── Template Interfaces ────────────────────────────────────────────

export interface GoalTemplateInput {
  title: string;
  domain: KanbanDomain;
  metaType?: MetaType;
  targetDate?: string;
  kpiDefinition?: string;
  priority?: number;
  tags?: string[];
}

export interface GoalTemplateOutput {
  title: string;
  description: string;
  domain: KanbanDomain;
  metaType: MetaType;
  stage: KanbanStage;
  ownerId: string;
  priority: number;
  targetDate?: string;
  kpiDefinition?: string;
  tags: string[];
}

export interface CampaignTemplateInput {
  goalId: string;
  title: string;
  domain?: KanbanDomain;
  goalDomain?: KanbanDomain;
  startDate?: string;
  endDate?: string;
  budget?: number;
  tags?: string[];
}

export interface CampaignTemplateOutput {
  goalId: string;
  title: string;
  description: string;
  metaType: MetaType;
  domain: KanbanDomain;
  stage: KanbanStage;
  ownerId: string;
  priority: number;
  startDate?: string;
  endDate?: string;
  budget?: number;
  tags: string[];
}

export interface InitiativeTemplateInput {
  campaignId: string;
  goalId: string;
  title: string;
  domain?: KanbanDomain;
  startDate?: string;
  endDate?: string;
  tags?: string[];
}

export interface InitiativeTemplateOutput {
  campaignId: string;
  goalId: string;
  title: string;
  description: string;
  metaType: MetaType;
  domain: KanbanDomain;
  stage: KanbanStage;
  ownerId: string;
  priority: number;
  startDate?: string;
  endDate?: string;
  tags: string[];
}

export interface TaskTemplateInput {
  title: string;
  goalId: string;
  goalTitle: string;
  goalStage: KanbanStage;
  goalTargetDate?: string;
  domain: KanbanDomain;
  initiativeId?: string;
  campaignId?: string;
}

export interface TaskTemplateOutput {
  title: string;
  description: string;
  assignedAgentId: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimatedDuration: string;
  dueDate: string;
  domain: KanbanDomain;
  goalId: string;
  initiativeId?: string;
  campaignId?: string;
}

// ─── Template Functions ─────────────────────────────────────────────

/** Generate a fully-populated goal from minimal input */
export function goalTemplate(input: GoalTemplateInput): GoalTemplateOutput {
  const metaType = input.metaType || 'operational';
  const domain = input.domain;
  return {
    title: input.title,
    description: generateGoalDescription({
      title: input.title,
      domain,
      metaType,
      kpiDefinition: input.kpiDefinition,
      targetDate: input.targetDate,
    }),
    domain,
    metaType,
    stage: 'backlog',
    ownerId: DOMAIN_AGENTS[domain].owner,
    priority: input.priority ?? 5,
    targetDate: input.targetDate,
    kpiDefinition: input.kpiDefinition,
    tags: input.tags || [domain],
  };
}

/** Generate a fully-populated campaign (plan) from minimal input */
export function campaignTemplate(input: CampaignTemplateInput): CampaignTemplateOutput {
  const domain = input.domain || input.goalDomain || 'strategy';
  return {
    goalId: input.goalId,
    title: input.title,
    description: `**Campaign Plan — ${domain.charAt(0).toUpperCase() + domain.slice(1)} domain**\n\n` +
      `${input.title}.\n\n` +
      `**Objectives:**\n` +
      `- Define and execute a time-boxed effort to advance the parent goal\n` +
      `- Track progress via initiative completion rate\n\n` +
      `**Owner:** ${DOMAIN_AGENTS[domain].ownerName}`,
    metaType: 'operational',
    domain,
    stage: 'backlog',
    ownerId: DOMAIN_AGENTS[domain].owner,
    priority: 5,
    startDate: input.startDate,
    endDate: input.endDate,
    budget: input.budget,
    tags: input.tags || [domain],
  };
}

/** Generate a fully-populated initiative (action) from minimal input */
export function initiativeTemplate(input: InitiativeTemplateInput): InitiativeTemplateOutput {
  const domain = input.domain || 'strategy';
  return {
    campaignId: input.campaignId,
    goalId: input.goalId,
    title: input.title,
    description: `**Initiative — ${domain.charAt(0).toUpperCase() + domain.slice(1)} domain**\n\n` +
      `${input.title}.\n\n` +
      `**Scope:**\n` +
      `- Break down into concrete tasks\n` +
      `- Track task completion and quality\n\n` +
      `**Owner:** ${DOMAIN_AGENTS[domain].directors[0]?.replace('mabos-', '').replace(/-/g, ' ') || DOMAIN_AGENTS[domain].ownerName}`,
    metaType: 'tactical',
    domain,
    stage: 'backlog',
    ownerId: DOMAIN_AGENTS[domain].directors[0] || DOMAIN_AGENTS[domain].owner,
    priority: 5,
    startDate: input.startDate,
    endDate: input.endDate,
    tags: input.tags || [domain],
  };
}

/** Generate a fully-populated task from minimal input */
export function taskTemplate(input: TaskTemplateInput): TaskTemplateOutput {
  const priority = resolveTaskPriority(input.title, input.goalStage);
  return {
    title: input.title,
    description: generateTaskDescription(input.title, input.goalTitle, input.domain),
    assignedAgentId: resolveTaskAgent(input.title, input.domain),
    priority,
    estimatedDuration: estimateTaskDuration(input.title),
    dueDate: calculateDueDate({ priority }),
    domain: input.domain,
    goalId: input.goalId,
    initiativeId: input.initiativeId,
    campaignId: input.campaignId,
  };
}
