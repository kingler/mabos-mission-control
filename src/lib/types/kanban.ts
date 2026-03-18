/**
 * Goal-Driven Agent Kanban — Type Definitions
 *
 * 4-Tier Hierarchy: Goals → Campaigns → Initiatives → Work Packages (Tasks)
 *
 * Each tier maps to a BDI concept:
 *   Goal     → Desire (long-term aspiration)
 *   Campaign → Intention (committed plan)
 *   Initiative → Active plan step
 *   Task     → Concrete action
 */

// ─── Enums ────────────────────────────────────────────────────────────

export type KanbanTier = 'goal' | 'campaign' | 'initiative' | 'task';

export type MetaType =
  | 'strategic'
  | 'operational'
  | 'tactical'
  | 'exploratory';

export type KanbanDomain =
  | 'product'
  | 'marketing'
  | 'finance'
  | 'operations'
  | 'technology'
  | 'legal'
  | 'hr'
  | 'strategy';

export type KanbanStage =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done'
  | 'cancelled';

export type BdiState = 'belief' | 'desire' | 'intention' | 'action';

export type BdiTransitionType =
  | 'desire_adopted'
  | 'intention_committed'
  | 'plan_selected'
  | 'action_executed'
  | 'goal_achieved'
  | 'goal_dropped'
  | 'belief_revised';

// ─── Core Entities ────────────────────────────────────────────────────

export interface CardCoord {
  goalId: string;
  campaignId?: string;
  initiativeId?: string;
  taskId?: string;
}

export interface KanbanGoal {
  id: string;
  businessId: string;
  title: string;
  description?: string;
  metaType: MetaType;
  domain: KanbanDomain;
  stage: KanbanStage;
  ownerId?: string;
  priority: number;
  targetDate?: string;
  progressPct: number;
  kpiDefinition?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanCampaign {
  id: string;
  goalId: string;
  businessId: string;
  title: string;
  description?: string;
  metaType: MetaType;
  domain: KanbanDomain;
  stage: KanbanStage;
  ownerId?: string;
  priority: number;
  startDate?: string;
  endDate?: string;
  progressPct: number;
  budget?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanInitiative {
  id: string;
  campaignId: string;
  goalId: string;
  businessId: string;
  title: string;
  description?: string;
  metaType: MetaType;
  domain: KanbanDomain;
  stage: KanbanStage;
  ownerId?: string;
  priority: number;
  startDate?: string;
  endDate?: string;
  progressPct: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanCardMeta {
  taskId: string;
  initiativeId?: string;
  campaignId?: string;
  goalId: string;
  metaType: MetaType;
  domain: KanbanDomain;
  storyPoints?: number;
  tags?: string[];
}

// ─── BDI Log ──────────────────────────────────────────────────────────

export interface BdiLogEntry {
  id: string;
  agentId: string;
  businessId: string;
  bdiState: BdiState;
  transitionType: BdiTransitionType;
  refTier: KanbanTier;
  refId: string;
  summary: string;
  details?: string;
  confidence?: number;
  createdAt: string;
}

export interface StageTransition {
  id: string;
  entityTier: KanbanTier;
  entityId: string;
  fromStage: KanbanStage;
  toStage: KanbanStage;
  agentId?: string;
  reason?: string;
  createdAt: string;
}

// ─── WIP Limits ───────────────────────────────────────────────────────

export interface WipLimit {
  id: string;
  tier: KanbanTier;
  domain: KanbanDomain;
  stage: KanbanStage;
  maxItems: number;
  currentCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Metrics ──────────────────────────────────────────────────────────

export interface KanbanMetric {
  id: string;
  businessId: string;
  metricName: string;
  metricValue: number;
  unit: string;
  tier?: KanbanTier;
  domain?: KanbanDomain;
  periodStart: string;
  periodEnd: string;
  metadata?: string;
  createdAt: string;
}

// ─── WebSocket Bridge Messages ────────────────────────────────────────

export type KanbanWsMessageType =
  | 'kanban:bdi_declaration'
  | 'kanban:transition'
  | 'kanban:anomaly'
  | 'kanban:metric_posted'
  | 'kanban:goal_created'
  | 'kanban:campaign_created'
  | 'kanban:initiative_created'
  | 'kanban:card_linked';

export interface KanbanWsMessage {
  type: KanbanWsMessageType;
  payload: BdiLogEntry | StageTransition | KanbanMetric | KanbanGoal | KanbanCampaign | KanbanInitiative | KanbanCardMeta;
  timestamp: string;
  agentId?: string;
}

// ─── API Request Types ────────────────────────────────────────────────

export interface CreateGoalRequest {
  title: string;
  description?: string;
  metaType?: MetaType;
  domain: KanbanDomain;
  ownerId?: string;
  priority?: number;
  targetDate?: string;
  kpiDefinition?: string;
  tags?: string[];
}

export interface CreateCampaignRequest {
  goalId: string;
  title: string;
  description?: string;
  metaType?: MetaType;
  domain?: KanbanDomain;
  ownerId?: string;
  priority?: number;
  startDate?: string;
  endDate?: string;
  budget?: number;
  tags?: string[];
}

export interface CreateInitiativeRequest {
  campaignId: string;
  title: string;
  description?: string;
  metaType?: MetaType;
  domain?: KanbanDomain;
  ownerId?: string;
  priority?: number;
  startDate?: string;
  endDate?: string;
  tags?: string[];
}

export interface LinkTaskRequest {
  taskId: string;
  initiativeId?: string;
  campaignId?: string;
  goalId: string;
  metaType?: MetaType;
  domain?: KanbanDomain;
  storyPoints?: number;
  tags?: string[];
}

// ─── View Models (for UI) ─────────────────────────────────────────────

export interface GoalWithCounts extends KanbanGoal {
  campaignCount: number;
  initiativeCount: number;
  taskCount: number;
  completedTaskCount: number;
}

export interface CampaignWithChildren extends KanbanCampaign {
  initiatives: KanbanInitiative[];
  taskCount: number;
}

export interface GoalHierarchy extends KanbanGoal {
  campaigns: CampaignWithChildren[];
}
