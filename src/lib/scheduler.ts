/**
 * Auto-Dispatch Scheduler
 *
 * Periodically finds tasks in 'assigned' status with an assigned agent
 * and dispatches them to the OpenClaw Gateway for execution.
 *
 * Controls:
 *   - Max concurrent tasks per agent (prevents overload)
 *   - Priority ordering (urgent > high > normal > low)
 *   - Configurable interval and batch size
 *   - Pause/resume without losing state
 *
 * Usage:
 *   import { getScheduler } from '@/lib/scheduler';
 *   const scheduler = getScheduler();
 *   scheduler.start();        // Begin auto-dispatching
 *   scheduler.stop();         // Pause
 *   scheduler.runOnce();      // Single dispatch cycle
 *   scheduler.getStatus();    // Current state
 */

import { queryAll, queryOne, run } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import { getRelevantKnowledge, formatKnowledgeForDispatch } from '@/lib/learner';
import { getTaskWorkflow } from '@/lib/workflow-engine';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Agent, OpenClawSession, WorkflowStage, TaskImage } from '@/lib/types';

// ─── Cron Job & Heartbeat IDs ───────────────────────────────────────

const CRON_DISPATCH_ID = 'CRON-auto-dispatch';
const CRON_HEARTBEAT_ID = 'CRON-scheduler-heartbeat';

// ─── Configuration ──────────────────────────────────────────────────

interface SchedulerConfig {
  /** Dispatch cycle interval in milliseconds (default: 5 minutes) */
  intervalMs: number;
  /** Max concurrent in_progress tasks per agent (default: 2) */
  maxTasksPerAgent: number;
  /** Max tasks to dispatch per cycle (default: 5) */
  batchSize: number;
  /** Cooldown between individual dispatches in ms (default: 2000) */
  dispatchCooldownMs: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  intervalMs: 5 * 60 * 1000,      // 5 minutes
  maxTasksPerAgent: 2,              // 2 concurrent per agent
  batchSize: 5,                     // 5 tasks per cycle
  dispatchCooldownMs: 2000,         // 2s between dispatches
};

// ─── Types ──────────────────────────────────────────────────────────

interface DispatchResult {
  taskId: string;
  taskTitle: string;
  agentId: string;
  agentName: string;
  success: boolean;
  error?: string;
}

interface SchedulerStatus {
  running: boolean;
  health: 'healthy' | 'degraded' | 'error';
  startedAt: string | null;
  lastCycleAt: string | null;
  lastHeartbeatAt: string | null;
  lastCycleResults: DispatchResult[];
  totalDispatched: number;
  totalFailed: number;
  cycleCount: number;
  config: SchedulerConfig;
  queueDepth: number;
  agentLoad: Record<string, { inProgress: number; assigned: number }>;
  lastError: string | null;
  cronJobIds: { dispatch: string; heartbeat: string };
}

// ─── Priority Ordering ──────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ─── Scheduler Class ────────────────────────────────────────────────

class AutoDispatchScheduler {
  private timer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private running = false;
  private dispatching = false;
  private config: SchedulerConfig;
  private lastCycleAt: string | null = null;
  private lastCycleResults: DispatchResult[] = [];
  private totalDispatched = 0;
  private totalFailed = 0;
  private cycleCount = 0;
  private startedAt: string | null = null;
  private lastHeartbeatAt: string | null = null;
  private healthStatus: 'healthy' | 'degraded' | 'error' = 'healthy';
  private lastError: string | null = null;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start the scheduler (runs dispatch cycles on interval) */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.healthStatus = 'healthy';
    this.lastError = null;

    console.log(`[Scheduler] Started — interval: ${this.config.intervalMs}ms, max/agent: ${this.config.maxTasksPerAgent}, batch: ${this.config.batchSize}`);

    // Register as cron jobs in the MABOS cron table
    this.registerCronJobs();

    // Start heartbeat (every 30 seconds)
    this.startHeartbeat();

    // Run first cycle immediately
    this.runOnce().catch(err => console.error('[Scheduler] First cycle error:', err));

    // Schedule recurring cycles
    this.timer = setInterval(() => {
      this.runOnce().catch(err => console.error('[Scheduler] Cycle error:', err));
    }, this.config.intervalMs);
  }

  /** Stop the scheduler */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Update cron job status
    this.updateCronJobStatus('paused');

    // Broadcast stop event
    this.emitHeartbeat('stopped');

    console.log('[Scheduler] Stopped');
  }

  // ─── Cron Job Registration ────────────────────────────────────────

  /** Register the scheduler as cron jobs in mabos_cron_jobs table */
  private registerCronJobs(): void {
    const now = new Date().toISOString();
    const intervalMin = Math.round(this.config.intervalMs / 60000);
    const cronSchedule = `*/${intervalMin} * * * *`;

    // Register dispatch cron job
    run(
      `INSERT INTO mabos_cron_jobs (id, business_id, name, schedule, agent_id, action, enabled, status, last_run, next_run, synced_at)
       VALUES (?, 'vividwalls', ?, ?, 'system', 'auto_dispatch', 1, 'active', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         schedule = excluded.schedule,
         enabled = 1,
         status = 'active',
         last_run = excluded.last_run,
         next_run = excluded.next_run,
         synced_at = excluded.synced_at`,
      [CRON_DISPATCH_ID, 'Auto-Dispatch Scheduler', cronSchedule, now, this.calculateNextRun(), now]
    );

    // Register heartbeat cron job
    run(
      `INSERT INTO mabos_cron_jobs (id, business_id, name, schedule, agent_id, action, enabled, status, last_run, next_run, synced_at)
       VALUES (?, 'vividwalls', ?, '*/1 * * * *', 'system', 'scheduler_heartbeat', 1, 'active', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         enabled = 1,
         status = 'active',
         last_run = excluded.last_run,
         next_run = excluded.next_run,
         synced_at = excluded.synced_at`,
      [CRON_HEARTBEAT_ID, 'Scheduler Heartbeat', now, now, now]
    );

    console.log(`[Scheduler] Registered cron jobs: ${CRON_DISPATCH_ID} (${cronSchedule}), ${CRON_HEARTBEAT_ID} (*/1 * * * *)`);
  }

  /** Update cron job status in the database */
  private updateCronJobStatus(status: 'active' | 'paused' | 'error'): void {
    const now = new Date().toISOString();
    run(
      'UPDATE mabos_cron_jobs SET status = ?, synced_at = ? WHERE id IN (?, ?)',
      [status, now, CRON_DISPATCH_ID, CRON_HEARTBEAT_ID]
    );
  }

  /** Update dispatch cron job last_run and next_run */
  private updateDispatchCronRun(): void {
    const now = new Date().toISOString();
    run(
      'UPDATE mabos_cron_jobs SET last_run = ?, next_run = ?, synced_at = ? WHERE id = ?',
      [now, this.calculateNextRun(), now, CRON_DISPATCH_ID]
    );
  }

  /** Calculate next dispatch run time */
  private calculateNextRun(): string {
    return new Date(Date.now() + this.config.intervalMs).toISOString();
  }

  // ─── Heartbeat System ─────────────────────────────────────────────

  /** Start heartbeat broadcasting (every 30 seconds) */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    // Emit initial heartbeat
    this.emitHeartbeat('started');

    // Schedule periodic heartbeats
    this.heartbeatTimer = setInterval(() => {
      this.emitHeartbeat('pulse');
    }, 30000); // 30 seconds
  }

  /** Emit a heartbeat event via SSE broadcast and log to agent_activities */
  private emitHeartbeat(eventType: 'started' | 'pulse' | 'stopped' | 'cycle_complete' | 'error'): void {
    const now = new Date().toISOString();
    this.lastHeartbeatAt = now;

    const status = this.getStatus();
    const agentLoadSummary = this.getAgentLoadSummary();

    // Broadcast via SSE for LiveFeed
    broadcast({
      type: 'scheduler:heartbeat' as any,
      payload: {
        event: eventType,
        running: this.running,
        health: this.healthStatus,
        queueDepth: status.queueDepth,
        totalDispatched: this.totalDispatched,
        totalFailed: this.totalFailed,
        cycleCount: this.cycleCount,
        lastCycleAt: this.lastCycleAt,
        startedAt: this.startedAt,
        agentLoad: agentLoadSummary,
        lastError: this.lastError,
        timestamp: now,
      } as any,
    });

    // Update heartbeat cron job
    run(
      'UPDATE mabos_cron_jobs SET last_run = ?, synced_at = ? WHERE id = ?',
      [now, now, CRON_HEARTBEAT_ID]
    );

    // Log to agent_activities for the activity feed (only on meaningful events, not every pulse)
    if (eventType !== 'pulse') {
      const summaryMessages: Record<string, string> = {
        started: `Scheduler started — ${status.queueDepth} tasks queued, dispatching every ${Math.round(this.config.intervalMs / 60000)}min`,
        stopped: `Scheduler stopped — ${this.totalDispatched} dispatched, ${this.totalFailed} failed across ${this.cycleCount} cycles`,
        cycle_complete: `Dispatch cycle #${this.cycleCount}: ${this.lastCycleResults.filter(r => r.success).length} dispatched, ${this.lastCycleResults.filter(r => !r.success).length} failed — ${status.queueDepth} remaining`,
        error: `Scheduler error: ${this.lastError || 'Unknown'} — health: ${this.healthStatus}`,
      };

      run(
        `INSERT INTO agent_activities (id, agent_id, category, tool_name, summary, duration_ms, outcome, metadata, created_at)
         VALUES (?, 'system', 'workflow', 'auto_dispatch', ?, 0, ?, ?, ?)`,
        [
          uuidv4(),
          summaryMessages[eventType] || `Scheduler ${eventType}`,
          this.healthStatus === 'error' ? 'error' : 'ok',
          JSON.stringify({
            event: eventType,
            queueDepth: status.queueDepth,
            dispatched: this.totalDispatched,
            failed: this.totalFailed,
            cycles: this.cycleCount,
            agentLoad: agentLoadSummary,
          }),
          now,
        ]
      );
    }

    // Log to events table for LiveFeed
    if (eventType === 'cycle_complete' || eventType === 'error') {
      run(
        `INSERT INTO events (id, type, message, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          uuidv4(),
          eventType === 'error' ? 'scheduler_error' : 'scheduler_cycle',
          eventType === 'error'
            ? `Scheduler error: ${this.lastError}`
            : `Dispatch cycle #${this.cycleCount}: ${this.lastCycleResults.filter(r => r.success).length} tasks dispatched to agents`,
          now,
        ]
      );
    }
  }

  /** Get summary of current agent task loads */
  private getAgentLoadSummary(): Record<string, { inProgress: number; assigned: number }> {
    const loads: Record<string, { inProgress: number; assigned: number }> = {};
    const rows = queryAll<{ assigned_agent_id: string; status: string; cnt: number }>(
      `SELECT assigned_agent_id, status, COUNT(*) as cnt
       FROM tasks
       WHERE assigned_agent_id IS NOT NULL
         AND status IN ('in_progress', 'assigned')
       GROUP BY assigned_agent_id, status`
    );
    for (const row of rows) {
      if (!loads[row.assigned_agent_id]) {
        loads[row.assigned_agent_id] = { inProgress: 0, assigned: 0 };
      }
      if (row.status === 'in_progress') loads[row.assigned_agent_id].inProgress = row.cnt;
      if (row.status === 'assigned') loads[row.assigned_agent_id].assigned = row.cnt;
    }
    return loads;
  }

  /** Update configuration (restarts if running) */
  updateConfig(updates: Partial<SchedulerConfig>): void {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.config = { ...this.config, ...updates };
    if (wasRunning) this.start();
  }

  /** Run a single dispatch cycle */
  async runOnce(): Promise<DispatchResult[]> {
    if (this.dispatching) {
      console.log('[Scheduler] Cycle already in progress, skipping');
      return [];
    }

    this.dispatching = true;
    const results: DispatchResult[] = [];

    try {
      // 1. Find dispatchable tasks (assigned + has agent)
      const candidateTasks = queryAll<
        Task & { agent_name: string; agent_session_key_prefix: string | null }
      >(
        `SELECT t.*, a.name as agent_name, a.session_key_prefix as agent_session_key_prefix
         FROM tasks t
         JOIN agents a ON t.assigned_agent_id = a.id
         WHERE t.status = 'assigned'
           AND t.assigned_agent_id IS NOT NULL
         ORDER BY
           CASE t.priority
             WHEN 'urgent' THEN 0
             WHEN 'high' THEN 1
             WHEN 'normal' THEN 2
             WHEN 'low' THEN 3
             ELSE 4
           END,
           t.created_at ASC
         LIMIT ?`,
        [this.config.batchSize * 2] // Fetch extra in case some agents are at capacity
      );

      if (candidateTasks.length === 0) {
        console.log('[Scheduler] No tasks to dispatch');
        this.lastCycleAt = new Date().toISOString();
        this.lastCycleResults = [];
        this.cycleCount++;
        return [];
      }

      // 2. Check agent capacity (count in_progress tasks per agent)
      const agentLoads = new Map<string, number>();
      const inProgressCounts = queryAll<{ assigned_agent_id: string; cnt: number }>(
        `SELECT assigned_agent_id, COUNT(*) as cnt
         FROM tasks
         WHERE status = 'in_progress'
           AND assigned_agent_id IS NOT NULL
         GROUP BY assigned_agent_id`
      );
      for (const row of inProgressCounts) {
        agentLoads.set(row.assigned_agent_id, row.cnt);
      }

      // 3. Filter to tasks whose agents have capacity
      const dispatchable = candidateTasks.filter(t => {
        const currentLoad = agentLoads.get(t.assigned_agent_id!) || 0;
        return currentLoad < this.config.maxTasksPerAgent;
      });

      // 4. Take up to batchSize
      const batch = dispatchable.slice(0, this.config.batchSize);

      console.log(`[Scheduler] Dispatching ${batch.length}/${candidateTasks.length} tasks (${dispatchable.length} eligible)`);

      // 5. Connect to OpenClaw if needed
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        try {
          await client.connect();
        } catch (err) {
          console.error('[Scheduler] Failed to connect to OpenClaw:', err);
          return [{
            taskId: '',
            taskTitle: '',
            agentId: '',
            agentName: '',
            success: false,
            error: 'Failed to connect to OpenClaw Gateway',
          }];
        }
      }

      // 6. Dispatch each task with cooldown
      for (const task of batch) {
        try {
          const result = await this.dispatchTask(task, client);
          results.push(result);

          if (result.success) {
            this.totalDispatched++;
            // Update agent load tracking
            const agentId = task.assigned_agent_id!;
            agentLoads.set(agentId, (agentLoads.get(agentId) || 0) + 1);
          } else {
            this.totalFailed++;
          }

          // Cooldown between dispatches
          if (batch.indexOf(task) < batch.length - 1) {
            await new Promise(r => setTimeout(r, this.config.dispatchCooldownMs));
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          results.push({
            taskId: task.id,
            taskTitle: task.title,
            agentId: task.assigned_agent_id || '',
            agentName: task.agent_name || '',
            success: false,
            error,
          });
          this.totalFailed++;
        }
      }
    } catch (outerErr) {
      this.healthStatus = 'error';
      this.lastError = outerErr instanceof Error ? outerErr.message : 'Unknown error';
      this.emitHeartbeat('error');
      throw outerErr;
    } finally {
      this.dispatching = false;
      this.lastCycleAt = new Date().toISOString();
      this.lastCycleResults = results;
      this.cycleCount++;

      // Update health status
      const failCount = results.filter(r => !r.success).length;
      if (failCount > 0 && failCount === results.length) {
        this.healthStatus = 'error';
        this.lastError = 'All dispatches failed in last cycle';
      } else if (failCount > 0) {
        this.healthStatus = 'degraded';
        this.lastError = `${failCount}/${results.length} dispatches failed`;
      } else {
        this.healthStatus = 'healthy';
        this.lastError = null;
      }

      // Update cron job tracking
      this.updateDispatchCronRun();

      // Emit cycle complete heartbeat
      this.emitHeartbeat('cycle_complete');
    }

    return results;
  }

  /** Dispatch a single task to its agent */
  private async dispatchTask(
    task: Task & { agent_name: string; agent_session_key_prefix: string | null },
    client: ReturnType<typeof getOpenClawClient>,
  ): Promise<DispatchResult> {
    const agentId = task.assigned_agent_id!;
    const agentName = task.agent_name;

    // Get or create session
    let session = queryOne<OpenClawSession>(
      'SELECT * FROM openclaw_sessions WHERE agent_id = ? AND status = ?',
      [agentId, 'active']
    );

    const now = new Date().toISOString();

    if (!session) {
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${agentName.toLowerCase().replace(/\s+/g, '-')}`;
      run(
        `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agentId, openclawSessionId, 'mission-control', 'active', now, now]
      );
      session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE id = ?',
        [sessionId]
      );
    }

    if (!session) {
      return { taskId: task.id, taskTitle: task.title, agentId, agentName, success: false, error: 'Failed to create session' };
    }

    // Build task message
    const priorityEmoji: Record<string, string> = { low: '🔵', normal: '⚪', high: '🟡', urgent: '🔴' };
    const projectsPath = getProjectsPath();
    const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const taskProjectDir = `${projectsPath}/${projectDir}`;
    const missionControlUrl = getMissionControlUrl();

    // Knowledge injection
    let knowledgeSection = '';
    try {
      const knowledge = getRelevantKnowledge(task.workspace_id, task.title);
      knowledgeSection = formatKnowledgeForDispatch(knowledge);
    } catch { /* best-effort */ }

    // Workflow stage detection
    const workflow = getTaskWorkflow(task.id);
    let nextStatus = 'review';
    if (workflow) {
      let stageIndex = workflow.stages.findIndex((s: WorkflowStage) => s.status === task.status);
      if (stageIndex < 0) {
        stageIndex = workflow.stages.findIndex((s: WorkflowStage) => s.role === 'builder');
      }
      if (stageIndex >= 0 && stageIndex + 1 < workflow.stages.length) {
        nextStatus = workflow.stages[stageIndex + 1].status;
      }
    }

    const taskMessage = `${priorityEmoji[task.priority] || '⚪'} **NEW TASK ASSIGNED**

**Title:** ${task.title}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Priority:** ${task.priority.toUpperCase()}
${task.due_date ? `**Due:** ${task.due_date}\n` : ''}
**Task ID:** ${task.id}
${knowledgeSection}
**OUTPUT DIRECTORY:** ${taskProjectDir}
Create this directory and save all deliverables there.

**IMPORTANT:** After completing work, you MUST call these APIs:
1. Log activity: POST ${missionControlUrl}/api/tasks/${task.id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable: POST ${missionControlUrl}/api/tasks/${task.id}/deliverables
   Body: {"deliverable_type": "file", "title": "File name", "path": "${taskProjectDir}/filename"}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${task.id}
   Body: {"status": "${nextStatus}"}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\`

If you need help or clarification, ask the orchestrator.`;

    // Send to agent via OpenClaw
    const prefix = task.agent_session_key_prefix || 'agent:main:';
    const sessionKey = `${prefix}${session.openclaw_session_id}`;

    await client.call('chat.send', {
      sessionKey,
      message: taskMessage,
      idempotencyKey: `auto-dispatch-${task.id}-${Date.now()}`,
    });

    // Update task status → in_progress
    run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['in_progress', now, task.id]);

    // Update agent status → working
    run('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', ['working', now, agentId]);

    // Broadcast task update
    const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
    if (updatedTask) {
      broadcast({ type: 'task_updated', payload: updatedTask });
    }

    // Log events
    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), 'task_dispatched', agentId, task.id, `[Auto-Dispatch] Task "${task.title}" dispatched to ${agentName}`, now]
    );
    run(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), task.id, agentId, 'status_changed', `[Auto-Dispatch] Task dispatched to ${agentName}`, now]
    );

    console.log(`[Scheduler] ✓ Dispatched "${task.title}" → ${agentName}`);

    return { taskId: task.id, taskTitle: task.title, agentId, agentName, success: true };
  }

  /** Get current scheduler status */
  getStatus(): SchedulerStatus {
    const queueDepth = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM tasks
       WHERE status = 'assigned' AND assigned_agent_id IS NOT NULL`
    )?.cnt || 0;

    return {
      running: this.running,
      health: this.healthStatus,
      startedAt: this.startedAt,
      lastCycleAt: this.lastCycleAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastCycleResults: this.lastCycleResults,
      totalDispatched: this.totalDispatched,
      totalFailed: this.totalFailed,
      cycleCount: this.cycleCount,
      config: { ...this.config },
      queueDepth,
      agentLoad: this.getAgentLoadSummary(),
      lastError: this.lastError,
      cronJobIds: { dispatch: CRON_DISPATCH_ID, heartbeat: CRON_HEARTBEAT_ID },
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────

const SCHEDULER_KEY = '__auto_dispatch_scheduler__';

export function getScheduler(): AutoDispatchScheduler {
  if (!(SCHEDULER_KEY in globalThis)) {
    (globalThis as Record<string, unknown>)[SCHEDULER_KEY] = new AutoDispatchScheduler();
  }
  return (globalThis as unknown as Record<string, AutoDispatchScheduler>)[SCHEDULER_KEY];
}
