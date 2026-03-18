/**
 * MABOS Type Definitions
 * Mirrors MABOS API response shapes for Mission Control integration
 */

// ─── Agent Types ───

export type MabosAgentStatus = 'active' | 'idle' | 'error' | 'paused';
export type MabosAgentType = 'core' | 'domain';
export type MabosAutonomyLevel = 'low' | 'medium' | 'high';

export interface MabosAgent {
  id: string;
  name: string;
  type: MabosAgentType;
  beliefs: number;
  goals: number;
  intentions: number;
  desires: number;
  status: MabosAgentStatus;
  autonomy_level: MabosAutonomyLevel;
  approval_threshold_usd: number;
}

export interface MabosAgentDetail {
  agentId: string;
  beliefCount: number;
  goalCount: number;
  intentionCount: number;
  desireCount: number;
  beliefs: string[];
  goals: string[];
  intentions: string[];
  desires: string[];
}

export interface MabosAgentFile {
  filename: string;
  category: 'bdi' | 'core' | 'template';
  size: number;
  modified: string;
}

export interface MabosAgentFileContent {
  filename: string;
  content: string;
  category: 'bdi' | 'core' | 'template';
}

// ─── Task Types ───

export type MabosTaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

export interface MabosTask {
  id: string;
  plan_id: string;
  plan_name: string;
  step_id: string;
  title: string;
  description?: string;
  status: MabosTaskStatus;
  priority: 'low' | 'medium' | 'high';
  type: string;
  assignedAgents: string[];
  department: string;
  depends_on: string[];
  estimated_duration: string;
  agent_id: string;
}

export interface CreateMabosTaskInput {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  type?: string;
  agent_id?: string;
  plan_name?: string;
}

// ─── Decision Types ───

export type DecisionUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
}

export interface MabosDecision {
  id: string;
  title: string;
  summary: string;
  urgency: DecisionUrgency;
  agentId: string;
  agentName: string;
  businessId: string;
  businessName: string;
  options: DecisionOption[];
  agentRecommendation?: string;
  createdAt: string;
}

export interface DecisionResolution {
  optionId: string;
  feedback?: string;
  action: 'approve' | 'reject' | 'defer';
}

// ─── Goal Types ───

export type GoalLevel = 'strategic' | 'tactical' | 'operational';
export type GoalType = 'hardgoal' | 'softgoal' | 'task' | 'resource';

export interface TroposActor {
  id: string;
  name: string;
  type: 'principal' | 'agent';
  goals: string[];
}

export interface BusinessGoal {
  id: string;
  name: string;
  text?: string;
  description: string;
  level: GoalLevel;
  type: GoalType;
  priority: number;
  actor?: string;
  desires: string[];
  workflows: unknown[];
  parentGoalId?: string;
}

export interface GoalRefinement {
  parentGoalId: string;
  childGoalId: string;
  type: 'and-refinement' | 'or-refinement' | 'contribution';
  label?: string;
}

export interface TroposDependency {
  from: string;
  to: string;
  type: 'delegation' | 'contribution';
  goalId: string;
}

export interface TroposGoalModel {
  actors: TroposActor[];
  goals: BusinessGoal[];
  dependencies: TroposDependency[];
  refinements?: GoalRefinement[];
}

// ─── Cron Types ───

export type CronJobStatus = 'active' | 'paused' | 'error';

export interface MabosCronJob {
  id: string;
  name: string;
  schedule: string;
  agentId: string;
  action: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  status: CronJobStatus;
  workflowId?: string;
  stepId?: string;
}

// ─── BDI Types ───

export interface BdiCycleResult {
  ok: boolean;
  beliefs_updated?: number;
  goals_revised?: number;
  intentions_committed?: number;
  actions_executed?: number;
}

// ─── Business Types ───

export interface MabosBusiness {
  id: string;
  name: string;
  description: string;
  stage: string;
  agentCount: number;
  healthScore: number;
}

// ─── Sync Types ───

export interface SyncReport {
  agents: { synced: number; errors: number };
  goals: { inserted: number; updated: number; errors: number };
  tasksFromMabos: { inserted: number; updated: number; errors: number };
  tasksToMabos: { pushed: number; errors: number };
  decisions: { synced: number; errors: number };
  cronJobs: { synced: number; errors: number };
  duration_ms: number;
}

export interface SyncState {
  entity_type: string;
  last_synced_at: string;
  last_sync_status: string | null;
  error_message: string | null;
}

// ─── Event Types ───

export type MabosEventType =
  | 'mabos:agent_update'
  | 'mabos:cron_executed'
  | 'mabos:sync_complete'
  | 'mabos:task_created'
  | 'mabos:decision_pending'
  | 'mabos:activity';

export interface MabosSSEEvent {
  type: MabosEventType;
  payload: Record<string, unknown>;
}

// ─── Cognitive Activity Types ───

export type ActivityCategory = 'bdi' | 'memory' | 'knowledge' | 'reasoning' | 'communication' | 'workflow';

export interface AgentCognitiveActivity {
  id: string;
  agent_id: string;
  category: ActivityCategory;
  tool_name: string;
  summary: string;
  duration_ms: number;
  outcome: 'ok' | 'error';
  error_message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}
