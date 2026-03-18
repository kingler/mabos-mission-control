/**
 * MABOS Sync Engine
 * Bidirectional sync between Mission Control SQLite and MABOS API
 *
 * Source of truth rules:
 * - MC owns tasks with origin='mc'
 * - MABOS owns tasks with origin='mabos' and all BDI state
 */

import type Database from 'better-sqlite3';
import type { MabosApiClient } from './client';
import type { SyncReport, MabosTask, MabosCronJob, AgentCognitiveActivity } from './types';
import { v4 as uuid } from 'uuid';

// Status mapping: MC → MABOS
const MC_TO_MABOS_STATUS: Record<string, string> = {
  inbox: 'todo',
  assigned: 'todo',
  in_progress: 'in_progress',
  testing: 'in_progress',
  review: 'review',
  verification: 'review',
  done: 'done',
  planning: 'backlog',
  pending_dispatch: 'backlog',
};

// Status mapping: MABOS → MC
const MABOS_TO_MC_STATUS: Record<string, string> = {
  backlog: 'inbox',
  todo: 'inbox',
  in_progress: 'in_progress',
  review: 'review',
  done: 'done',
};

// Actor → kanban_goals domain mapping
const ACTOR_TO_DOMAIN: Record<string, string> = {
  ceo: 'strategy',
  cfo: 'finance',
  cmo: 'marketing',
  coo: 'operations',
  cto: 'technology',
  hr: 'hr',
  legal: 'legal',
  strategy: 'strategy',
  knowledge: 'strategy',
  ecommerce: 'product',
  'lead-gen': 'marketing',
  'sales-research': 'marketing',
  outreach: 'marketing',
};

// MABOS priority (0-1 float, higher = more important) → kanban priority (1-10 int, lower = more important)
function mapGoalPriority(mabosPriority: number): number {
  return Math.max(1, Math.min(10, Math.round(11 - mabosPriority * 10)));
}

export class MabosSyncEngine {
  private db: Database.Database;
  private client: MabosApiClient;
  private businessId: string;

  constructor(db: Database.Database, client: MabosApiClient, businessId: string) {
    this.db = db;
    this.client = client;
    this.businessId = businessId;
  }

  async syncAll(): Promise<SyncReport> {
    const start = Date.now();
    const report: SyncReport = {
      agents: { synced: 0, errors: 0 },
      goals: { inserted: 0, updated: 0, errors: 0 },
      tasksFromMabos: { inserted: 0, updated: 0, errors: 0 },
      tasksToMabos: { pushed: 0, errors: 0 },
      decisions: { synced: 0, errors: 0 },
      cronJobs: { synced: 0, errors: 0 },
      duration_ms: 0,
    };

    try {
      await this.syncAgents(report);
    } catch (err) {
      console.error('[MabosSync] Agent sync failed:', err);
      report.agents.errors++;
    }

    try {
      await this.syncGoals(report);
    } catch (err) {
      console.error('[MabosSync] Goal sync failed:', err);
      report.goals.errors++;
    }

    try {
      await this.syncTasksFromMabos(report);
    } catch (err) {
      console.error('[MabosSync] Tasks-from-MABOS sync failed:', err);
      report.tasksFromMabos.errors++;
    }

    try {
      await this.syncTasksToMabos(report);
    } catch (err) {
      console.error('[MabosSync] Tasks-to-MABOS sync failed:', err);
      report.tasksToMabos.errors++;
    }

    try {
      await this.syncDecisions(report);
    } catch (err) {
      console.error('[MabosSync] Decision sync failed:', err);
      report.decisions.errors++;
    }

    try {
      await this.syncCronJobs(report);
    } catch (err) {
      console.error('[MabosSync] Cron sync failed:', err);
      report.cronJobs.errors++;
    }

    try {
      await this.syncActivities();
    } catch (err) {
      console.error('[MabosSync] Activities sync failed:', err);
    }

    report.duration_ms = Date.now() - start;

    // Update sync state
    this.updateSyncState('all', report.duration_ms > 0 ? 'success' : 'error');

    console.log(`[MabosSync] Complete in ${report.duration_ms}ms`, JSON.stringify(report));
    return report;
  }

  async syncAgents(report?: SyncReport): Promise<void> {
    const agents = await this.client.getAgents(this.businessId);
    const now = new Date().toISOString();

    // Agent hierarchy: known parent mappings based on MABOS org structure
    const HIERARCHY: Record<string, string | null> = {
      'ceo': null,
      'cfo': 'ceo', 'cmo': 'ceo', 'coo': 'ceo', 'cto': 'ceo',
      'hr': 'ceo', 'legal': 'ceo', 'strategy': 'ceo',
      'knowledge': 'ceo', 'ecommerce': 'ceo',
      'lead-gen': 'cmo', 'sales-research': 'cmo', 'outreach': 'cmo',
    };

    const upsertAgent = this.db.prepare(`
      INSERT INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, source, gateway_agent_id,
        agent_type, autonomy_level, parent_agent_id, belief_count, goal_count, intention_count, desire_count, bdi_synced_at, created_at, updated_at)
      VALUES (@id, @name, @role, @description, @avatar, 'standby', 0, 'default', 'gateway', @gatewayId,
        @agentType, @autonomy, @parentId, @beliefs, @goals, @intentions, @desires, @syncedAt, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        name = @name, role = @role, status = CASE WHEN agents.source = 'gateway' THEN 'standby' ELSE agents.status END,
        agent_type = @agentType, autonomy_level = @autonomy, parent_agent_id = @parentId,
        belief_count = @beliefs, goal_count = @goals, intention_count = @intentions, desire_count = @desires,
        bdi_synced_at = @syncedAt, updated_at = @now
    `);

    const EMOJI_MAP: Record<string, string> = {
      ceo: '👔', cfo: '💰', cmo: '📣', coo: '⚙️', cto: '💻',
      hr: '🧑‍💼', legal: '⚖️', strategy: '🎯', knowledge: '📚', ecommerce: '🛒',
      'lead-gen': '🎣', 'sales-research': '🔍', outreach: '📧',
    };

    for (const agent of agents) {
      try {
        const agentId = `mabos-${agent.id}`;
        const parentRaw = HIERARCHY[agent.id];
        const parentId = parentRaw ? `mabos-${parentRaw}` : null;

        upsertAgent.run({
          id: agentId,
          name: agent.name,
          role: agent.type === 'core' ? 'C-Suite Executive' : 'Specialist',
          description: `MABOS ${agent.type} agent: ${agent.name}`,
          avatar: EMOJI_MAP[agent.id] || '🤖',
          gatewayId: agent.id,
          agentType: agent.type,
          autonomy: agent.autonomy_level,
          parentId,
          beliefs: agent.beliefs,
          goals: agent.goals,
          intentions: agent.intentions,
          desires: agent.desires,
          syncedAt: now,
          now,
        });

        if (report) report.agents.synced++;
      } catch (err) {
        console.error(`[MabosSync] Agent ${agent.id} sync error:`, err);
        if (report) report.agents.errors++;
      }
    }

    this.updateSyncState('agents', 'success');
  }

  async syncGoals(report?: SyncReport): Promise<void> {
    const goalModel = await this.client.getGoals(this.businessId);
    const now = new Date().toISOString();

    const upsert = this.db.prepare(`
      INSERT INTO kanban_goals (id, business_id, title, description, meta_type, domain, stage, owner_id, priority, tags, created_at, updated_at)
      VALUES (@id, @businessId, @title, @description, @metaType, @domain, @stage, @ownerId, @priority, @tags, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        title = @title, description = @description, meta_type = @metaType,
        domain = @domain, owner_id = @ownerId, priority = @priority, tags = @tags,
        updated_at = @now
    `);

    const findGoal = this.db.prepare('SELECT id, stage FROM kanban_goals WHERE id = ?');

    for (const goal of goalModel.goals) {
      try {
        const domain = ACTOR_TO_DOMAIN[goal.actor || ''] || 'strategy';
        const metaType = goal.level || 'strategic';
        const ownerId = goal.actor ? `mabos-${goal.actor}` : null;
        const priority = mapGoalPriority(goal.priority);
        const tags = JSON.stringify({
          level: goal.level,
          type: goal.type,
          actor: goal.actor,
          mabos_priority: goal.priority,
        });

        const existing = findGoal.get(goal.id) as { id: string; stage: string } | undefined;

        upsert.run({
          id: goal.id,
          businessId: this.businessId,
          title: goal.name,
          description: goal.description || '',
          metaType,
          domain,
          stage: existing?.stage || 'backlog',
          ownerId,
          priority,
          tags,
          now,
        });

        if (existing) {
          if (report) report.goals.updated++;
        } else {
          if (report) report.goals.inserted++;
        }
      } catch (err) {
        console.error(`[MabosSync] Goal ${goal.id} sync error:`, err);
        if (report) report.goals.errors++;
      }
    }

    this.updateSyncState('goals', 'success');
  }

  async syncTasksFromMabos(report?: SyncReport): Promise<void> {
    const mabosTasks = await this.client.getTasks(this.businessId);
    const now = new Date().toISOString();

    const upsertTask = this.db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, workspace_id, business_id,
        origin, external_id, mabos_plan_name, depends_on, estimated_duration, sync_status, synced_at, created_at, updated_at)
      VALUES (@id, @title, @description, @status, @priority, @assignedAgent, 'default', @businessId,
        'mabos', @externalId, @planName, @dependsOn, @estimatedDuration, 'synced', @now, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        title = @title, description = @description,
        status = @status, priority = @priority, assigned_agent_id = @assignedAgent,
        mabos_plan_name = @planName, depends_on = @dependsOn, estimated_duration = @estimatedDuration,
        sync_status = 'synced', synced_at = @now, updated_at = @now
      WHERE tasks.origin = 'mabos'
    `);

    // Check if task already exists by external_id
    const findByExternal = this.db.prepare(
      `SELECT id FROM tasks WHERE origin = 'mabos' AND external_id = ?`
    );

    for (const task of mabosTasks) {
      try {
        const existing = findByExternal.get(task.id) as { id: string } | undefined;
        const mcId = existing?.id || `mabos-task-${task.id}`;
        const mcStatus = MABOS_TO_MC_STATUS[task.status] || 'inbox';
        const mcPriority = task.priority === 'medium' ? 'normal' : task.priority;
        const assignedAgent = task.agent_id ? `mabos-${task.agent_id}` : null;

        upsertTask.run({
          id: mcId,
          title: task.title,
          description: task.description || null,
          status: mcStatus,
          priority: mcPriority,
          assignedAgent,
          businessId: this.businessId,
          externalId: task.id,
          planName: task.plan_name || null,
          dependsOn: task.depends_on?.length ? JSON.stringify(task.depends_on) : null,
          estimatedDuration: task.estimated_duration || null,
          now,
        });

        if (existing) {
          if (report) report.tasksFromMabos.updated++;
        } else {
          if (report) report.tasksFromMabos.inserted++;
        }
      } catch (err) {
        console.error(`[MabosSync] Task ${task.id} from MABOS error:`, err);
        if (report) report.tasksFromMabos.errors++;
      }
    }

    this.updateSyncState('tasks_from_mabos', 'success');
  }

  async syncTasksToMabos(report?: SyncReport): Promise<void> {
    // Find MC tasks that need to be pushed to MABOS
    const pendingTasks = this.db.prepare(
      `SELECT * FROM tasks WHERE origin = 'mc' AND sync_status = 'pending'`
    ).all() as Array<Record<string, unknown>>;

    const now = new Date().toISOString();

    for (const task of pendingTasks) {
      try {
        const mabosStatus = MC_TO_MABOS_STATUS[task.status as string] || 'todo';

        const result = await this.client.createTask(this.businessId, {
          title: task.title as string,
          description: (task.description as string) || undefined,
          priority: task.priority === 'normal' ? 'medium' : (task.priority as 'low' | 'medium' | 'high'),
          type: 'general',
        });

        if (result.ok) {
          // Mark as synced (we don't get back the external ID from the simple create endpoint,
          // so we mark it synced and will match on next pull)
          this.db.prepare(
            `UPDATE tasks SET sync_status = 'synced', synced_at = ? WHERE id = ?`
          ).run(now, task.id);

          if (report) report.tasksToMabos.pushed++;
        }
      } catch (err) {
        console.error(`[MabosSync] Task ${task.id} to MABOS error:`, err);
        // Mark as error to avoid retrying endlessly
        this.db.prepare(
          `UPDATE tasks SET sync_status = 'error', synced_at = ? WHERE id = ?`
        ).run(now, task.id);
        if (report) report.tasksToMabos.errors++;
      }
    }

    this.updateSyncState('tasks_to_mabos', 'success');
  }

  async syncDecisions(report?: SyncReport): Promise<void> {
    const decisions = await this.client.getDecisions();
    const now = new Date().toISOString();

    const upsert = this.db.prepare(`
      INSERT INTO mabos_decisions (id, business_id, urgency, agent_id, description, status, synced_at)
      VALUES (@id, @businessId, @urgency, @agentId, @description, 'pending', @now)
      ON CONFLICT(id) DO UPDATE SET
        urgency = @urgency, agent_id = @agentId, description = @description, synced_at = @now
      WHERE mabos_decisions.status = 'pending'
    `);

    for (const d of decisions) {
      try {
        upsert.run({
          id: d.id,
          businessId: d.businessId,
          urgency: d.urgency,
          agentId: d.agentId,
          description: `${d.title}: ${d.summary}`,
          now,
        });
        if (report) report.decisions.synced++;
      } catch (err) {
        console.error(`[MabosSync] Decision ${d.id} sync error:`, err);
        if (report) report.decisions.errors++;
      }
    }

    this.updateSyncState('decisions', 'success');
  }

  async syncCronJobs(report?: SyncReport): Promise<void> {
    const jobs = await this.client.getCronJobs(this.businessId);
    const now = new Date().toISOString();

    const upsert = this.db.prepare(`
      INSERT INTO mabos_cron_jobs (id, business_id, name, schedule, agent_id, action, enabled, status, last_run, next_run, synced_at)
      VALUES (@id, @businessId, @name, @schedule, @agentId, @action, @enabled, @status, @lastRun, @nextRun, @now)
      ON CONFLICT(id) DO UPDATE SET
        name = @name, schedule = @schedule, agent_id = @agentId, action = @action,
        enabled = @enabled, status = @status, last_run = @lastRun, next_run = @nextRun, synced_at = @now
    `);

    for (const job of jobs) {
      try {
        upsert.run({
          id: job.id,
          businessId: this.businessId,
          name: job.name,
          schedule: job.schedule,
          agentId: job.agentId,
          action: job.action,
          enabled: job.enabled ? 1 : 0,
          status: job.status,
          lastRun: job.lastRun || null,
          nextRun: job.nextRun || null,
          now,
        });
        if (report) report.cronJobs.synced++;
      } catch (err) {
        console.error(`[MabosSync] Cron job ${job.id} sync error:`, err);
        if (report) report.cronJobs.errors++;
      }
    }

    this.updateSyncState('cron_jobs', 'success');
  }

  async syncActivities(): Promise<void> {
    // Get all MABOS agent IDs
    const agents = this.db.prepare(
      "SELECT gateway_agent_id FROM agents WHERE source = 'gateway' AND gateway_agent_id IS NOT NULL"
    ).all() as { gateway_agent_id: string }[];

    const lastSync = this.db.prepare(
      "SELECT last_synced_at FROM sync_state WHERE entity_type = 'activities'"
    ).get() as { last_synced_at: string } | undefined;

    const since = lastSync?.last_synced_at;
    const now = new Date().toISOString();

    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO agent_activities (id, agent_id, category, tool_name, summary, duration_ms, outcome, error_message, metadata, created_at)
      VALUES (@id, @agent_id, @category, @tool_name, @summary, @duration_ms, @outcome, @error_message, @metadata, @created_at)
    `);

    let totalSynced = 0;

    for (const { gateway_agent_id } of agents) {
      try {
        const activities = await this.client.getActivities(gateway_agent_id, {
          since: since || undefined,
          limit: 200,
        });

        for (const activity of activities) {
          upsert.run({
            id: activity.id,
            agent_id: activity.agent_id ?? gateway_agent_id,
            category: activity.category,
            tool_name: activity.tool_name,
            summary: activity.summary,
            duration_ms: activity.duration_ms ?? 0,
            outcome: activity.outcome ?? 'ok',
            error_message: activity.error_message ?? null,
            metadata: activity.metadata ? JSON.stringify(activity.metadata) : null,
            created_at: activity.created_at,
          });
          totalSynced++;
        }
      } catch (err) {
        console.error(`[MabosSync] Activities for ${gateway_agent_id}:`, err);
      }
    }

    // Trim to last 1000 per agent
    this.db.prepare(`
      DELETE FROM agent_activities WHERE id IN (
        SELECT id FROM agent_activities a
        WHERE (SELECT COUNT(*) FROM agent_activities b WHERE b.agent_id = a.agent_id AND b.created_at > a.created_at) >= 1000
      )
    `).run();

    this.updateSyncState('activities', 'success');
    console.log(`[MabosSync] Activities synced: ${totalSynced} records`);
  }

  private updateSyncState(entityType: string, status: string, error?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sync_state (entity_type, last_synced_at, last_sync_status, error_message)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(entity_type) DO UPDATE SET
        last_synced_at = ?, last_sync_status = ?, error_message = ?
    `).run(entityType, now, status, error || null, now, status, error || null);
  }
}
