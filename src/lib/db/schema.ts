/**
 * Database Schema for Mission Control
 * 
 * This defines the current desired schema state.
 * For existing databases, migrations handle schema updates.
 * 
 * IMPORTANT: When adding new tables or columns:
 * 1. Add them here for new databases
 * 2. Create a migration in migrations.ts for existing databases
 */

export const schema = `
-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT '📁',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  avatar_emoji TEXT DEFAULT '🤖',
  status TEXT DEFAULT 'standby' CHECK (status IN ('standby', 'working', 'offline')),
  is_master INTEGER DEFAULT 0,
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  soul_md TEXT,
  user_md TEXT,
  agents_md TEXT,
  model TEXT,
  source TEXT DEFAULT 'local',
  gateway_agent_id TEXT,
  session_key_prefix TEXT,
  agent_type TEXT DEFAULT 'domain',
  autonomy_level TEXT DEFAULT 'medium',
  parent_agent_id TEXT,
  belief_count INTEGER DEFAULT 0,
  goal_count INTEGER DEFAULT 0,
  intention_count INTEGER DEFAULT 0,
  desire_count INTEGER DEFAULT 0,
  bdi_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tasks table (Mission Queue)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'inbox' CHECK (status IN ('pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'verification', 'done')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_agent_id TEXT REFERENCES agents(id),
  created_by_agent_id TEXT REFERENCES agents(id),
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  business_id TEXT DEFAULT 'default',
  due_date TEXT,
  workflow_template_id TEXT REFERENCES workflow_templates(id),
  planning_session_key TEXT,
  planning_messages TEXT,
  planning_complete INTEGER DEFAULT 0,
  planning_spec TEXT,
  planning_agents TEXT,
  planning_dispatch_error TEXT,
  status_reason TEXT,
  images TEXT,
  origin TEXT DEFAULT 'mc',
  external_id TEXT,
  mabos_plan_name TEXT,
  depends_on TEXT,
  estimated_duration TEXT,
  sync_status TEXT DEFAULT 'local',
  synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Planning questions table
CREATE TABLE IF NOT EXISTS planning_questions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'text', 'yes_no')),
  options TEXT,
  answer TEXT,
  answered_at TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Planning specs table (locked specifications)
CREATE TABLE IF NOT EXISTS planning_specs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  spec_markdown TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  locked_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Conversations table (agent-to-agent or task-related)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  type TEXT DEFAULT 'direct' CHECK (type IN ('direct', 'group', 'task')),
  task_id TEXT REFERENCES tasks(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Conversation participants
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, agent_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  sender_agent_id TEXT REFERENCES agents(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'task_update', 'file')),
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Events table (for live feed)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id),
  task_id TEXT REFERENCES tasks(id),
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Businesses/Workspaces table (legacy - kept for compatibility)
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- OpenClaw session mapping
CREATE TABLE IF NOT EXISTS openclaw_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  openclaw_session_id TEXT NOT NULL,
  channel TEXT,
  status TEXT DEFAULT 'active',
  session_type TEXT DEFAULT 'persistent',
  task_id TEXT REFERENCES tasks(id),
  ended_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Workflow templates (per-workspace workflow definitions)
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  stages TEXT NOT NULL,
  fail_targets TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Task role assignments (role -> agent mapping per task)
CREATE TABLE IF NOT EXISTS task_roles (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(task_id, role)
);

-- Knowledge entries (learner knowledge base)
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
  task_id TEXT REFERENCES tasks(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  confidence REAL DEFAULT 0.5,
  created_by_agent_id TEXT REFERENCES agents(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Task activities table (for real-time activity log)
CREATE TABLE IF NOT EXISTS task_activities (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  activity_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Task deliverables table (files, URLs, artifacts)
CREATE TABLE IF NOT EXISTS task_deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  deliverable_type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- MABOS decisions cache
CREATE TABLE IF NOT EXISTS mabos_decisions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  urgency TEXT,
  agent_id TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending',
  feedback TEXT,
  resolved_at TEXT,
  synced_at TEXT NOT NULL
);

-- MABOS cron jobs cache
CREATE TABLE IF NOT EXISTS mabos_cron_jobs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  agent_id TEXT,
  action TEXT,
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  last_run TEXT,
  next_run TEXT,
  synced_at TEXT NOT NULL
);

-- Sync state tracking
CREATE TABLE IF NOT EXISTS sync_state (
  entity_type TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL,
  last_sync_status TEXT,
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_activities_task ON task_activities(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliverables_task ON task_deliverables(task_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_task ON openclaw_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON workflow_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_task_roles_task ON task_roles(task_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_workspace ON knowledge_entries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_task ON knowledge_entries(task_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external ON tasks(origin, external_id) WHERE external_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- Goal-Driven Agent Kanban Meta-Model
-- 4-Tier: Goals → Campaigns → Initiatives → Tasks
-- ═══════════════════════════════════════════════════════════════

-- Tier 1: Goals (Desires)
CREATE TABLE IF NOT EXISTS kanban_goals (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT,
  meta_type TEXT NOT NULL DEFAULT 'strategic'
    CHECK (meta_type IN ('strategic','operational','tactical','exploratory')),
  domain TEXT NOT NULL DEFAULT 'strategy'
    CHECK (domain IN ('product','marketing','finance','operations','technology','legal','hr','strategy')),
  stage TEXT NOT NULL DEFAULT 'backlog'
    CHECK (stage IN ('backlog','ready','in_progress','blocked','review','done','cancelled')),
  owner_id TEXT REFERENCES agents(id),
  priority INTEGER NOT NULL DEFAULT 5,
  target_date TEXT,
  progress_pct REAL NOT NULL DEFAULT 0,
  kpi_definition TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tier 2: Campaigns (Intentions)
CREATE TABLE IF NOT EXISTS kanban_campaigns (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES kanban_goals(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT,
  meta_type TEXT NOT NULL DEFAULT 'operational'
    CHECK (meta_type IN ('strategic','operational','tactical','exploratory')),
  domain TEXT NOT NULL DEFAULT 'strategy'
    CHECK (domain IN ('product','marketing','finance','operations','technology','legal','hr','strategy')),
  stage TEXT NOT NULL DEFAULT 'backlog'
    CHECK (stage IN ('backlog','ready','in_progress','blocked','review','done','cancelled')),
  owner_id TEXT REFERENCES agents(id),
  priority INTEGER NOT NULL DEFAULT 5,
  start_date TEXT,
  end_date TEXT,
  progress_pct REAL NOT NULL DEFAULT 0,
  budget REAL,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tier 3: Initiatives
CREATE TABLE IF NOT EXISTS kanban_initiatives (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES kanban_campaigns(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES kanban_goals(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT,
  meta_type TEXT NOT NULL DEFAULT 'tactical'
    CHECK (meta_type IN ('strategic','operational','tactical','exploratory')),
  domain TEXT NOT NULL DEFAULT 'strategy'
    CHECK (domain IN ('product','marketing','finance','operations','technology','legal','hr','strategy')),
  stage TEXT NOT NULL DEFAULT 'backlog'
    CHECK (stage IN ('backlog','ready','in_progress','blocked','review','done','cancelled')),
  owner_id TEXT REFERENCES agents(id),
  priority INTEGER NOT NULL DEFAULT 5,
  start_date TEXT,
  end_date TEXT,
  progress_pct REAL NOT NULL DEFAULT 0,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tier 4: Link tasks to hierarchy
CREATE TABLE IF NOT EXISTS kanban_card_meta (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  initiative_id TEXT REFERENCES kanban_initiatives(id),
  campaign_id TEXT REFERENCES kanban_campaigns(id),
  goal_id TEXT NOT NULL REFERENCES kanban_goals(id),
  meta_type TEXT NOT NULL DEFAULT 'operational'
    CHECK (meta_type IN ('strategic','operational','tactical','exploratory')),
  domain TEXT NOT NULL DEFAULT 'strategy'
    CHECK (domain IN ('product','marketing','finance','operations','technology','legal','hr','strategy')),
  story_points INTEGER,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- BDI declaration log
CREATE TABLE IF NOT EXISTS bdi_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  business_id TEXT NOT NULL DEFAULT 'default',
  bdi_state TEXT NOT NULL CHECK (bdi_state IN ('belief','desire','intention','action')),
  transition_type TEXT NOT NULL
    CHECK (transition_type IN ('desire_adopted','intention_committed','plan_selected','action_executed','goal_achieved','goal_dropped','belief_revised')),
  ref_tier TEXT NOT NULL CHECK (ref_tier IN ('goal','campaign','initiative','task')),
  ref_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  confidence REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Stage transition audit
CREATE TABLE IF NOT EXISTS stage_transitions (
  id TEXT PRIMARY KEY,
  entity_tier TEXT NOT NULL CHECK (entity_tier IN ('goal','campaign','initiative','task')),
  entity_id TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  agent_id TEXT,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- WIP limits
CREATE TABLE IF NOT EXISTS wip_limits (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('goal','campaign','initiative','task')),
  domain TEXT NOT NULL CHECK (domain IN ('product','marketing','finance','operations','technology','legal','hr','strategy')),
  stage TEXT NOT NULL CHECK (stage IN ('backlog','ready','in_progress','blocked','review','done','cancelled')),
  max_items INTEGER NOT NULL DEFAULT 5,
  current_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tier, domain, stage)
);

-- Kanban metrics
CREATE TABLE IF NOT EXISTS kanban_metrics (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL DEFAULT 'default',
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  tier TEXT CHECK (tier IN ('goal','campaign','initiative','task')),
  domain TEXT CHECK (domain IN ('product','marketing','finance','operations','technology','legal','hr','strategy')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Kanban indexes
CREATE INDEX IF NOT EXISTS idx_kanban_goals_stage ON kanban_goals(stage);
CREATE INDEX IF NOT EXISTS idx_kanban_goals_domain ON kanban_goals(domain);
CREATE INDEX IF NOT EXISTS idx_kanban_goals_owner ON kanban_goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_kanban_campaigns_goal ON kanban_campaigns(goal_id);
CREATE INDEX IF NOT EXISTS idx_kanban_campaigns_stage ON kanban_campaigns(stage);
CREATE INDEX IF NOT EXISTS idx_kanban_initiatives_campaign ON kanban_initiatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_kanban_initiatives_goal ON kanban_initiatives(goal_id);
CREATE INDEX IF NOT EXISTS idx_kanban_card_meta_goal ON kanban_card_meta(goal_id);
CREATE INDEX IF NOT EXISTS idx_kanban_card_meta_initiative ON kanban_card_meta(initiative_id);
CREATE INDEX IF NOT EXISTS idx_bdi_log_agent ON bdi_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bdi_log_ref ON bdi_log(ref_tier, ref_id);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_entity ON stage_transitions(entity_tier, entity_id);
CREATE INDEX IF NOT EXISTS idx_kanban_metrics_name ON kanban_metrics(metric_name, period_start);

-- Agent cognitive activities
CREATE TABLE IF NOT EXISTS agent_activities (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  category TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  outcome TEXT DEFAULT 'ok',
  error_message TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_agent ON agent_activities(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_category ON agent_activities(category, created_at DESC);
`;
