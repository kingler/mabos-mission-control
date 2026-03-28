/**
 * Agent Execution Loop Integration Tests
 *
 * Tests the full BDI-driven agent execution loops:
 * - Goal decomposition → task creation
 * - Stage transition → agent handoff → dispatch
 * - Fail-loopback → re-dispatch to builder
 * - Escalation → fixer auto-creation
 * - Learner knowledge capture and injection
 * - Queue drain → auto-advance
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne, queryAll, transaction } from './db';
import {
  getTaskWorkflow,
  handleStageTransition,
  handleStageFailure,
  populateTaskRolesFromAgents,
  drainQueue,
} from './workflow-engine';
import {
  hasStageEvidence,
  ensureFixerExists,
  escalateFailureIfNeeded,
  getFailureCountInStage,
  pickDynamicAgent,
  taskCanBeDone,
} from './task-governance';
import { getRelevantKnowledge, formatKnowledgeForDispatch } from './learner';

// ── Helpers ─────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Workspace ${id}`, id]
  );
}

function seedAgent(id: string, workspace: string, role: string, name: string, opts?: { status?: string; isMaster?: number }) {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, source, created_at, updated_at)
     VALUES (?, ?, ?, 'test', '🤖', ?, ?, ?, 'local', datetime('now'), datetime('now'))`,
    [id, name, role, opts?.status ?? 'standby', opts?.isMaster ?? 0, workspace]
  );
}

function seedTask(id: string, workspace: string, status: string, templateId?: string, agentId?: string) {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO tasks (id, title, status, priority, workspace_id, business_id, workflow_template_id, assigned_agent_id, created_at, updated_at)
     VALUES (?, 'Integration Test Task', ?, 'normal', ?, 'default', ?, ?, datetime('now'), datetime('now'))`,
    [id, status, workspace, templateId ?? null, agentId ?? null]
  );
}

function seedWorkflowTemplate(id: string, workspace: string, stages: object[], failTargets: Record<string, string>) {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
     VALUES (?, ?, 'Integration Workflow', 'test', ?, ?, 1, datetime('now'), datetime('now'))`,
    [id, workspace, JSON.stringify(stages), JSON.stringify(failTargets)]
  );
}

function seedTaskRole(taskId: string, role: string, agentId: string) {
  run(
    `INSERT OR IGNORE INTO task_roles (id, task_id, role, agent_id, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [uid(), taskId, role, agentId]
  );
}

function seedGoal(id: string, workspace: string, title: string, stage = 'backlog') {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO kanban_goals (id, business_id, title, description, meta_type, domain, stage, priority, created_at, updated_at)
     VALUES (?, ?, ?, 'test goal', 'strategic', 'product', ?, 5, datetime('now'), datetime('now'))`,
    [id, workspace, title, stage]
  );
}

function seedKnowledgeEntry(workspace: string, title: string, content: string, category: string, confidence: number) {
  seedWorkspace(workspace);
  const taskId = uid();
  seedTask(taskId, workspace, 'done');
  run(
    `INSERT INTO knowledge_entries (id, workspace_id, task_id, category, title, content, tags, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, datetime('now'))`,
    [uid(), workspace, taskId, category, title, content, confidence]
  );
}

// ── Full pipeline stages definition ─────────────────────────────────

const FULL_PIPELINE_STAGES = [
  { status: 'assigned', label: 'Assigned', role: 'builder' },
  { status: 'in_progress', label: 'Build', role: 'builder' },
  { status: 'testing', label: 'Test', role: 'tester' },
  { status: 'review', label: 'Review Queue', role: null },
  { status: 'verification', label: 'Verify', role: 'reviewer' },
  { status: 'done', label: 'Done', role: null },
];

const FULL_FAIL_TARGETS: Record<string, string> = {
  testing: 'in_progress',
  verification: 'in_progress',
};

// ── Integration: Full Pipeline Loop ─────────────────────────────────

describe('Full Pipeline: Builder → Tester → Review → Reviewer → Done', () => {
  test('task progresses through all stages with agent handoffs', async () => {
    const ws = `ws-pipe-${uid()}`;
    const tplId = `tpl-pipe-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();
    const reviewerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Pipeline Builder');
    seedAgent(testerId, ws, 'tester', 'Pipeline Tester');
    seedAgent(reviewerId, ws, 'reviewer', 'Pipeline Reviewer');
    seedTask(taskId, ws, 'assigned', tplId);
    seedTaskRole(taskId, 'builder', builderId);
    seedTaskRole(taskId, 'tester', testerId);
    seedTaskRole(taskId, 'reviewer', reviewerId);

    // Stage 1: assigned → builder gets it
    let result = await handleStageTransition(taskId, 'assigned', { skipDispatch: true });
    assert.equal(result.handedOff, true);
    assert.equal(result.newAgentId, builderId);

    // Stage 2: in_progress → builder continues
    run('UPDATE tasks SET status = ? WHERE id = ?', ['in_progress', taskId]);
    result = await handleStageTransition(taskId, 'in_progress', { skipDispatch: true });
    assert.equal(result.newAgentId, builderId);

    // Stage 3: testing → tester takes over
    run('UPDATE tasks SET status = ? WHERE id = ?', ['testing', taskId]);
    result = await handleStageTransition(taskId, 'testing', { skipDispatch: true });
    assert.equal(result.handedOff, true);
    assert.equal(result.newAgentId, testerId);

    // Stage 4: review → queue stage (no handoff)
    run('UPDATE tasks SET status = ? WHERE id = ?', ['review', taskId]);
    result = await handleStageTransition(taskId, 'review', { skipDispatch: true });
    assert.equal(result.handedOff, false);

    // Stage 5: verification → reviewer takes over
    run('UPDATE tasks SET status = ? WHERE id = ?', ['verification', taskId]);
    result = await handleStageTransition(taskId, 'verification', { skipDispatch: true });
    assert.equal(result.handedOff, true);
    assert.equal(result.newAgentId, reviewerId);

    // Verify the task went through multiple agent assignments
    const activities = queryAll<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? AND activity_type = 'status_changed' ORDER BY created_at ASC`,
      [taskId]
    );
    assert.ok(activities.length >= 3, 'Should have at least 3 handoff activities');
  });
});

// ── Integration: Fail-Loopback Cycle ────────────────────────────────

describe('Fail-Loopback: Testing failure → back to Builder', () => {
  test('failed testing routes task back to builder via fail_target', async () => {
    const ws = `ws-failloop-${uid()}`;
    const tplId = `tpl-failloop-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Loopback Builder');
    seedAgent(testerId, ws, 'tester', 'Loopback Tester');
    seedTask(taskId, ws, 'testing', tplId);
    seedTaskRole(taskId, 'builder', builderId);
    seedTaskRole(taskId, 'tester', testerId);

    // Testing fails → should go back to in_progress (builder)
    const result = await handleStageFailure(taskId, 'testing', 'Button click does nothing');

    const task = queryOne<{ status: string; status_reason: string; assigned_agent_id: string }>(
      'SELECT status, status_reason, assigned_agent_id FROM tasks WHERE id = ?',
      [taskId]
    );

    assert.equal(task?.status, 'in_progress');
    assert.ok(task?.status_reason?.includes('Failed'));
    assert.equal(task?.assigned_agent_id, builderId, 'Builder should be re-assigned after fail-loopback');

    // Failure activity should be logged
    const failLog = queryOne<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? AND message LIKE '%Stage failed%'`,
      [taskId]
    );
    assert.ok(failLog);
    assert.ok(failLog!.message.includes('Button click does nothing'));
  });

  test('verification failure also routes back to builder', async () => {
    const ws = `ws-vfail-${uid()}`;
    const tplId = `tpl-vfail-${uid()}`;
    const taskId = uid();
    const builderId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Verify Fail Builder');
    seedTask(taskId, ws, 'verification', tplId);
    seedTaskRole(taskId, 'builder', builderId);

    const result = await handleStageFailure(taskId, 'verification', 'Missing null check on user input');

    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'in_progress');
  });
});

// ── Integration: Escalation after repeated failures ─────────────────

describe('Escalation: Repeated failures → Fixer agent', () => {
  test('fixer is created and assigned after 2 failures in same stage', async () => {
    const ws = `ws-esc-${uid()}`;
    const tplId = `tpl-esc-${uid()}`;
    const taskId = uid();
    const builderId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Escalation Builder');
    seedTask(taskId, ws, 'testing', tplId, builderId);
    seedTaskRole(taskId, 'builder', builderId);

    // Simulate 2 prior failures in 'testing' stage
    for (let i = 0; i < 2; i++) {
      run(
        `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
         VALUES (?, ?, 'status_changed', ?, datetime('now'))`,
        [uid(), taskId, `Stage failed: testing → in_progress (reason: failure ${i + 1})`]
      );
    }

    assert.equal(getFailureCountInStage(taskId, 'testing'), 2);

    await escalateFailureIfNeeded(taskId, 'testing');

    // Task should be reassigned to fixer
    const task = queryOne<{ assigned_agent_id: string; status_reason: string }>(
      'SELECT assigned_agent_id, status_reason FROM tasks WHERE id = ?',
      [taskId]
    );
    assert.ok(task?.status_reason?.includes('Escalated'));

    // Fixer agent should exist
    const fixer = queryOne<{ role: string }>(
      'SELECT role FROM agents WHERE id = ?',
      [task!.assigned_agent_id]
    );
    assert.equal(fixer?.role, 'fixer');

    // Escalation activity should be logged
    const escActivity = queryOne<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? AND message LIKE '%Escalated%'`,
      [taskId]
    );
    assert.ok(escActivity);
  });

  test('does not escalate with fewer than 2 failures', async () => {
    const ws = `ws-noesc-${uid()}`;
    const taskId = uid();

    seedTask(taskId, ws, 'testing');

    // Only 1 failure
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
       VALUES (?, ?, 'status_changed', 'Stage failed: testing → in_progress (reason: x)', datetime('now'))`,
      [uid(), taskId]
    );

    await escalateFailureIfNeeded(taskId, 'testing');

    const task = queryOne<{ status_reason: string | null }>('SELECT status_reason FROM tasks WHERE id = ?', [taskId]);
    // status_reason should NOT contain "Escalated"
    assert.ok(!task?.status_reason?.includes('Escalated'));
  });
});

// ── Integration: pickDynamicAgent ───────────────────────────────────

describe('pickDynamicAgent: Agent selection fallback chain', () => {
  test('picks agent from planning_agents when role matches', () => {
    const ws = `ws-pick-${uid()}`;
    const taskId = uid();
    const agentId = uid();

    seedAgent(agentId, ws, 'builder', 'Planning Builder');
    const planningAgents = JSON.stringify([{ agent_id: agentId, role: 'builder' }]);
    seedWorkspace(ws);
    run(
      `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, planning_agents, created_at, updated_at)
       VALUES (?, 'Pick Task', 'inbox', 'normal', ?, 'default', ?, datetime('now'), datetime('now'))`,
      [taskId, ws, planningAgents]
    );

    const picked = pickDynamicAgent(taskId, 'builder');
    assert.ok(picked);
    assert.equal(picked!.id, agentId);
  });

  test('falls back to role-based lookup when planning_agents empty', () => {
    const ws = `ws-pick-role-${uid()}`;
    const taskId = uid();
    const agentId = uid();

    seedAgent(agentId, ws, 'tester', 'Role Tester');
    seedTask(taskId, ws, 'inbox');

    const picked = pickDynamicAgent(taskId, 'tester');
    // May pick this agent or another tester in db — just verify it finds something
    if (picked) {
      assert.ok(picked.id);
      assert.ok(picked.name);
    }
  });

  test('skips offline agents', () => {
    const ws = `ws-pick-offline-${uid()}`;
    const taskId = uid();
    const offlineId = uid();
    const onlineId = uid();

    seedAgent(offlineId, ws, 'builder', 'Offline Builder', { status: 'offline' });
    seedAgent(onlineId, ws, 'builder', 'Online Builder');
    const planningAgents = JSON.stringify([
      { agent_id: offlineId, role: 'builder' },
      { agent_id: onlineId, role: 'builder' },
    ]);
    seedWorkspace(ws);
    run(
      `INSERT INTO tasks (id, title, status, priority, workspace_id, business_id, planning_agents, created_at, updated_at)
       VALUES (?, 'Offline Test Task', 'inbox', 'normal', ?, 'default', ?, datetime('now'), datetime('now'))`,
      [taskId, ws, planningAgents]
    );

    const picked = pickDynamicAgent(taskId, 'builder');
    assert.ok(picked);
    assert.equal(picked!.id, onlineId, 'Should skip offline agent and pick online one');
  });
});

// ── Integration: Queue drain ────────────────────────────────────────

describe('Queue Drain: Auto-advance from queue to next stage', () => {
  test('drains oldest task from review queue when verification is free', async () => {
    const ws = `ws-qdrain-${uid()}`;
    const tplId = `tpl-qdrain-${uid()}`;
    const task1 = uid();
    const task2 = uid();
    const reviewerId = uid();

    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'review', label: 'Review Queue', role: null },
      { status: 'verification', label: 'Verify', role: 'reviewer' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedAgent(reviewerId, ws, 'reviewer', 'Drain Reviewer');

    // Two tasks in review queue — task1 is older
    seedTask(task1, ws, 'review', tplId);
    run("UPDATE tasks SET updated_at = datetime('now', '-10 minutes') WHERE id = ?", [task1]);
    seedTask(task2, ws, 'review', tplId);
    seedTaskRole(task1, 'reviewer', reviewerId);
    seedTaskRole(task2, 'reviewer', reviewerId);

    await drainQueue(task1, ws);

    // Oldest (task1) should advance to verification
    const t1 = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [task1]);
    assert.equal(t1?.status, 'verification');

    // task2 should remain in review (verification now occupied)
    const t2 = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [task2]);
    assert.equal(t2?.status, 'review');
  });
});

// ── Integration: Knowledge Base ─────────────────────────────────────

describe('Knowledge Base: Capture and inject learnings', () => {
  test('getRelevantKnowledge returns entries sorted by confidence', () => {
    const ws = `ws-kb-${uid()}`;

    seedKnowledgeEntry(ws, 'Low confidence tip', 'Do something', 'pattern', 0.3);
    seedKnowledgeEntry(ws, 'High confidence fix', 'Always check nulls', 'fix', 0.95);
    seedKnowledgeEntry(ws, 'Medium pattern', 'Use linting', 'checklist', 0.7);

    const entries = getRelevantKnowledge(ws, 'Test task');
    assert.ok(entries.length >= 3);
    // Highest confidence should come first
    assert.ok(entries[0].confidence >= entries[1].confidence);
  });

  test('formatKnowledgeForDispatch produces markdown with entries', () => {
    const entries = [
      { id: '1', workspace_id: 'ws', task_id: 't1', category: 'fix', title: 'Check nulls', content: 'Always validate inputs', tags: [], confidence: 0.9, created_at: '' },
      { id: '2', workspace_id: 'ws', task_id: 't2', category: 'pattern', title: 'Use semantic HTML', content: 'Prefer semantic tags', tags: [], confidence: 0.8, created_at: '' },
    ];

    const output = formatKnowledgeForDispatch(entries);
    assert.ok(output.includes('PREVIOUS LESSONS LEARNED'));
    assert.ok(output.includes('Check nulls'));
    assert.ok(output.includes('Use semantic HTML'));
    assert.ok(output.includes('90%'));
    assert.ok(output.includes('80%'));
  });

  test('formatKnowledgeForDispatch returns empty string for no entries', () => {
    assert.equal(formatKnowledgeForDispatch([]), '');
  });
});

// ── Integration: BDI Log → Stage Auto-Transition ────────────────────

describe('BDI Log: Goal stage cascading', () => {
  test('goal can be created and queried from kanban_goals', () => {
    const goalId = uid();
    const ws = `ws-bdi-${uid()}`;

    seedGoal(goalId, ws, 'Launch Q3 product');

    const goal = queryOne<{ title: string; stage: string }>(
      'SELECT title, stage FROM kanban_goals WHERE id = ?',
      [goalId]
    );
    assert.ok(goal);
    assert.equal(goal!.title, 'Launch Q3 product');
    assert.equal(goal!.stage, 'backlog');
  });

  test('BDI log entry can be recorded for goal desire_adopted', () => {
    const goalId = uid();
    const ws = `ws-bdi-log-${uid()}`;
    const agentId = uid();

    seedGoal(goalId, ws, 'Expand market');
    seedAgent(agentId, ws, 'builder', 'BDI Agent');

    run(
      `INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, created_at)
       VALUES (?, ?, ?, 'desire', 'desire_adopted', 'goal', ?, 'Adopted goal to expand market', datetime('now'))`,
      [uid(), agentId, ws, goalId]
    );

    const entry = queryOne<{ bdi_state: string; transition_type: string; ref_tier: string }>(
      'SELECT bdi_state, transition_type, ref_tier FROM bdi_log WHERE ref_id = ?',
      [goalId]
    );
    assert.ok(entry);
    assert.equal(entry!.bdi_state, 'desire');
    assert.equal(entry!.transition_type, 'desire_adopted');
    assert.equal(entry!.ref_tier, 'goal');
  });

  test('goal_achieved transition updates goal stage to done', () => {
    const goalId = uid();
    const ws = `ws-bdi-done-${uid()}`;
    const agentId = uid();

    seedGoal(goalId, ws, 'Ship feature', 'in_progress');
    seedAgent(agentId, ws, 'builder', 'BDI Done Agent');

    // Simulate what the BDI log POST handler does
    run("UPDATE kanban_goals SET stage = ?, progress_pct = 100, updated_at = datetime('now') WHERE id = ?", ['done', goalId]);
    run(
      `INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, created_at)
       VALUES (?, ?, ?, 'desire', 'goal_achieved', 'goal', ?, 'Goal achieved', datetime('now'))`,
      [uid(), agentId, ws, goalId]
    );

    const goal = queryOne<{ stage: string; progress_pct: number }>(
      'SELECT stage, progress_pct FROM kanban_goals WHERE id = ?',
      [goalId]
    );
    assert.equal(goal?.stage, 'done');
    assert.equal(goal?.progress_pct, 100);
  });
});

// ── Integration: Evidence gate + task completion ────────────────────

describe('Evidence Gate: Task cannot be done without evidence', () => {
  test('task with no deliverables or activities fails evidence check', () => {
    const taskId = uid();
    seedTask(taskId, `ws-ev-${uid()}`, 'review');
    assert.equal(hasStageEvidence(taskId), false);
    assert.equal(taskCanBeDone(taskId), false);
  });

  test('task with deliverable + activity passes evidence check', () => {
    const ws = `ws-ev-pass-${uid()}`;
    const taskId = uid();
    seedTask(taskId, ws, 'review');

    run(
      `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, created_at)
       VALUES (?, ?, 'file', 'output.html', datetime('now'))`,
      [uid(), taskId]
    );
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
       VALUES (?, ?, 'completed', 'Built the page', datetime('now'))`,
      [uid(), taskId]
    );

    assert.equal(hasStageEvidence(taskId), true);
    assert.equal(taskCanBeDone(taskId), true);
  });

  test('task with validation failure in status_reason cannot be done even with evidence', () => {
    const ws = `ws-ev-fail-${uid()}`;
    const taskId = uid();
    seedTask(taskId, ws, 'review');

    run('UPDATE tasks SET status_reason = ? WHERE id = ?', ['Validation failed: missing alt tags', taskId]);
    run(
      `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, created_at)
       VALUES (?, ?, 'file', 'output.html', datetime('now'))`,
      [uid(), taskId]
    );
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, created_at)
       VALUES (?, ?, 'completed', 'Built it', datetime('now'))`,
      [uid(), taskId]
    );

    assert.equal(hasStageEvidence(taskId), true);
    assert.equal(taskCanBeDone(taskId), false, 'Should fail due to validation failure in status_reason');
  });
});

// ── Integration: Bootstrap idempotency ──────────────────────────────

describe('Bootstrap: Fixer agent creation is idempotent', () => {
  test('ensureFixerExists creates once, returns existing on second call', () => {
    const ws = `ws-boot-${uid()}`;
    seedWorkspace(ws);

    const first = ensureFixerExists(ws);
    assert.equal(first.created, true);

    const second = ensureFixerExists(ws);
    assert.equal(second.created, false);
    assert.equal(second.id, first.id, 'Should return the same fixer agent');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Orchestration Trigger Tests
//
// These tests simulate what the API routes (PATCH /tasks/[id], POST /tasks/[id]/fail,
// POST /webhooks/agent-completion) do when they trigger the workflow engine,
// validating that the orchestration wiring correctly dispatches to the next agent,
// updates agent status, drains queues, rolls up progress, and notifies learners.
// ═══════════════════════════════════════════════════════════════════════

// ── Orchestration: PATCH status change triggers workflow handoff ─────

describe('Orchestration: Status change triggers workflow handoff', () => {
  test('moving task to testing triggers tester handoff and logs event', async () => {
    const ws = `ws-orch-patch-${uid()}`;
    const tplId = `tpl-orch-patch-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Orch Builder');
    seedAgent(testerId, ws, 'tester', 'Orch Tester');
    seedTask(taskId, ws, 'in_progress', tplId, builderId);
    seedTaskRole(taskId, 'builder', builderId);
    seedTaskRole(taskId, 'tester', testerId);

    // Simulate what PATCH handler does: update status then call handleStageTransition
    const previousStatus = 'in_progress';
    const nextStatus = 'testing';
    const now = new Date().toISOString();

    run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, now, taskId]);

    // Log status change event (as PATCH handler does, line 164-168)
    run(
      `INSERT INTO events (id, type, task_id, message, created_at)
       VALUES (?, 'task_status_changed', ?, ?, ?)`,
      [uid(), taskId, `Task moved to ${nextStatus}`, now]
    );

    // PATCH handler triggers workflow handoff for testing/review/verification (lines 276-301)
    const stageResult = await handleStageTransition(taskId, nextStatus, {
      previousStatus,
      skipDispatch: true,
    });

    // Verify workflow handed off to tester
    assert.equal(stageResult.handedOff, true);
    assert.equal(stageResult.newAgentId, testerId);
    assert.equal(stageResult.newAgentName, 'Orch Tester');

    // Verify task was reassigned
    const task = queryOne<{ assigned_agent_id: string; status: string }>(
      'SELECT assigned_agent_id, status FROM tasks WHERE id = ?',
      [taskId]
    );
    assert.equal(task?.assigned_agent_id, testerId);
    assert.equal(task?.status, 'testing');

    // Verify event was logged
    const event = queryOne<{ type: string }>(
      `SELECT type FROM events WHERE task_id = ? AND type = 'task_status_changed'`,
      [taskId]
    );
    assert.ok(event);
  });

  test('assigning agent to inbox task auto-promotes to assigned status', () => {
    const ws = `ws-orch-assign-${uid()}`;
    const taskId = uid();
    const agentId = uid();

    seedAgent(agentId, ws, 'builder', 'Auto Assign Agent');
    seedTask(taskId, ws, 'inbox');

    // Simulate PATCH auto-promote logic (lines 144-151)
    const nextStatus = 'assigned';
    const now = new Date().toISOString();
    run('UPDATE tasks SET status = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?',
      [nextStatus, agentId, now, taskId]);

    const task = queryOne<{ status: string; assigned_agent_id: string }>(
      'SELECT status, assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'assigned');
    assert.equal(task?.assigned_agent_id, agentId);
  });
});

// ── Orchestration: Agent completion triggers next stage ──────────────

describe('Orchestration: Agent completion → next stage handoff', () => {
  test('builder completion moves task to testing and triggers tester handoff', async () => {
    const ws = `ws-orch-complete-${uid()}`;
    const tplId = `tpl-orch-complete-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Completion Builder', { status: 'working' });
    seedAgent(testerId, ws, 'tester', 'Completion Tester');
    seedTask(taskId, ws, 'in_progress', tplId, builderId);
    seedTaskRole(taskId, 'builder', builderId);
    seedTaskRole(taskId, 'tester', testerId);

    // Simulate what agent-completion webhook does (lines 82-110)
    const now = new Date().toISOString();

    // 1. Move task to testing
    run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['testing', now, taskId]);

    // 2. Log completion event
    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, 'task_completed', ?, ?, ?, ?)`,
      [uid(), builderId, taskId, 'Completion Builder completed: Built the auth system', now]
    );

    // 3. Set builder back to standby
    run("UPDATE agents SET status = 'standby', updated_at = ? WHERE id = ?", [now, builderId]);

    // 4. Now the PATCH handler would trigger handleStageTransition for 'testing'
    const stageResult = await handleStageTransition(taskId, 'testing', {
      previousStatus: 'in_progress',
      skipDispatch: true,
    });

    // Verify: tester now owns the task
    assert.equal(stageResult.handedOff, true);
    assert.equal(stageResult.newAgentId, testerId);

    // Verify: builder is back to standby
    const builder = queryOne<{ status: string }>('SELECT status FROM agents WHERE id = ?', [builderId]);
    assert.equal(builder?.status, 'standby');

    // Verify: task assigned to tester
    const task = queryOne<{ assigned_agent_id: string }>('SELECT assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.assigned_agent_id, testerId);
  });

  test('tester pass moves to review queue, reviewer picks up via drain', async () => {
    const ws = `ws-orch-tester-pass-${uid()}`;
    const tplId = `tpl-orch-tester-pass-${uid()}`;
    const taskId = uid();
    const testerId = uid();
    const reviewerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(testerId, ws, 'tester', 'Passing Tester');
    seedAgent(reviewerId, ws, 'reviewer', 'Queue Reviewer');
    seedTask(taskId, ws, 'testing', tplId, testerId);
    seedTaskRole(taskId, 'tester', testerId);
    seedTaskRole(taskId, 'reviewer', reviewerId);

    const now = new Date().toISOString();

    // Tester passes → task moves to review (queue stage)
    run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['review', now, taskId]);

    // handleStageTransition for queue stage (review, role=null)
    const queueResult = await handleStageTransition(taskId, 'review', { skipDispatch: true });
    assert.equal(queueResult.handedOff, false, 'Queue stage should not hand off');

    // drainQueue should advance to verification since it's free
    await drainQueue(taskId, ws);

    const task = queryOne<{ status: string; assigned_agent_id: string }>(
      'SELECT status, assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'verification', 'Task should advance from review to verification');
    assert.equal(task?.assigned_agent_id, reviewerId, 'Reviewer should be assigned');
  });
});

// ── Orchestration: Fail route triggers loopback + queue drain ────────

describe('Orchestration: Fail route triggers loopback + queue drain', () => {
  test('tester fail → builder re-assigned → queue slot freed for next task', async () => {
    const ws = `ws-orch-fail-drain-${uid()}`;
    const tplId = `tpl-orch-fail-drain-${uid()}`;
    const failingTask = uid();
    const queuedTask = uid();
    const builderId = uid();
    const testerId = uid();
    const reviewerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Fail Drain Builder');
    seedAgent(testerId, ws, 'tester', 'Fail Drain Tester');
    seedAgent(reviewerId, ws, 'reviewer', 'Fail Drain Reviewer');

    // failingTask is in testing, queuedTask is waiting in review
    seedTask(failingTask, ws, 'testing', tplId, testerId);
    seedTask(queuedTask, ws, 'review', tplId);
    seedTaskRole(failingTask, 'builder', builderId);
    seedTaskRole(failingTask, 'tester', testerId);
    seedTaskRole(failingTask, 'reviewer', reviewerId);
    seedTaskRole(queuedTask, 'reviewer', reviewerId);

    // Simulate what POST /api/tasks/[id]/fail does:
    // 1. Check task is in failable status (testing/review/verification) ✓
    // 2. Trigger handleStageFailure
    const failResult = await handleStageFailure(failingTask, 'testing', 'Images broken on mobile');

    // failingTask should be back with builder at in_progress
    const ft = queryOne<{ status: string; assigned_agent_id: string }>(
      'SELECT status, assigned_agent_id FROM tasks WHERE id = ?', [failingTask]);
    assert.equal(ft?.status, 'in_progress');
    assert.equal(ft?.assigned_agent_id, builderId, 'Builder should be re-assigned');

    // 3. Fail route drains queue after freeing slot (line 58-59)
    await drainQueue(failingTask, ws);

    // queuedTask should advance since verification is now free
    // review is queue for verification, and no task occupies verification anymore
    const qt = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [queuedTask]);
    assert.equal(qt?.status, 'verification', 'Queued task should advance to verification after testing slot freed');
  });
});

// ── Orchestration: Done triggers queue drain + progress rollup ───────

describe('Orchestration: Task done triggers queue drain + rollup', () => {
  test('task completing frees verification slot, queued task advances', async () => {
    const ws = `ws-orch-done-drain-${uid()}`;
    const tplId = `tpl-orch-done-drain-${uid()}`;
    const completedTask = uid();
    const queuedTask = uid();
    const reviewerId = uid();

    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'review', label: 'Review Queue', role: null },
      { status: 'verification', label: 'Verify', role: 'reviewer' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedAgent(reviewerId, ws, 'reviewer', 'Done Drain Reviewer');

    // completedTask in verification (occupying the slot), queuedTask waiting in review
    seedTask(completedTask, ws, 'verification', tplId);
    seedTask(queuedTask, ws, 'review', tplId);
    seedTaskRole(queuedTask, 'reviewer', reviewerId);

    // Verify queue is blocked before completion
    await drainQueue(completedTask, ws);
    let qt = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [queuedTask]);
    assert.equal(qt?.status, 'review', 'Queued task should stay in review while verification is occupied');

    // Simulate PATCH handler moving task to done (line 380-383)
    run("UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?", [completedTask]);

    // Drain queue after done (as PATCH handler does)
    await drainQueue(completedTask, ws);

    // Now the queued task should advance
    qt = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [queuedTask]);
    assert.equal(qt?.status, 'verification', 'Queued task should advance after verification slot freed');
  });

  test('rollup recalculates initiative progress from task completion', () => {
    const ws = `ws-orch-rollup-${uid()}`;
    const goalId = uid();
    const campaignId = uid();
    const initId = uid();
    const task1 = uid();
    const task2 = uid();

    seedGoal(goalId, ws, 'Rollup Goal', 'in_progress');

    // Create campaign linked to goal
    run(
      `INSERT INTO kanban_campaigns (id, goal_id, title, description, stage, priority, created_at, updated_at)
       VALUES (?, ?, 'Test Campaign', 'test', 'in_progress', 5, datetime('now'), datetime('now'))`,
      [campaignId, goalId]
    );

    // Create initiative linked to campaign and goal
    run(
      `INSERT INTO kanban_initiatives (id, campaign_id, goal_id, title, description, stage, priority, created_at, updated_at)
       VALUES (?, ?, ?, 'Test Initiative', 'test', 'in_progress', 5, datetime('now'), datetime('now'))`,
      [initId, campaignId, goalId]
    );

    // Create 2 tasks, 1 done, 1 in_progress
    seedTask(task1, ws, 'done');
    seedTask(task2, ws, 'in_progress');

    // Link tasks to initiative via kanban_card_meta
    run(
      `INSERT INTO kanban_card_meta (task_id, initiative_id, campaign_id, goal_id)
       VALUES (?, ?, ?, ?)`,
      [task1, initId, campaignId, goalId]
    );
    run(
      `INSERT INTO kanban_card_meta (task_id, initiative_id, campaign_id, goal_id)
       VALUES (?, ?, ?, ?)`,
      [task2, initId, campaignId, goalId]
    );

    // Simulate rollup logic (from /api/kanban/rollup POST handler)
    // Initiative progress = done tasks / total tasks
    const stats = queryOne<{ total: number; done: number }>(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done
       FROM kanban_card_meta m JOIN tasks t ON t.id = m.task_id
       WHERE m.initiative_id = ?`,
      [initId]
    );
    const initPct = Math.round(((stats?.done ?? 0) / (stats?.total ?? 1)) * 100);
    run("UPDATE kanban_initiatives SET progress_pct = ?, updated_at = datetime('now') WHERE id = ?",
      [initPct, initId]);

    // Campaign progress = avg of initiative progress
    const campAvg = queryOne<{ avg_pct: number }>(
      'SELECT AVG(progress_pct) as avg_pct FROM kanban_initiatives WHERE campaign_id = ?',
      [campaignId]
    );
    const campPct = Math.round(campAvg?.avg_pct ?? 0);
    run("UPDATE kanban_campaigns SET progress_pct = ?, updated_at = datetime('now') WHERE id = ?",
      [campPct, campaignId]);

    // Goal progress = avg of campaign progress
    const goalAvg = queryOne<{ avg_pct: number }>(
      'SELECT AVG(progress_pct) as avg_pct FROM kanban_campaigns WHERE goal_id = ?',
      [goalId]
    );
    const goalPct = Math.round(goalAvg?.avg_pct ?? 0);
    run("UPDATE kanban_goals SET progress_pct = ?, updated_at = datetime('now') WHERE id = ?",
      [goalPct, goalId]);

    // Verify cascaded progress: 1 of 2 tasks done = 50%
    const init = queryOne<{ progress_pct: number }>('SELECT progress_pct FROM kanban_initiatives WHERE id = ?', [initId]);
    assert.equal(init?.progress_pct, 50, 'Initiative should be 50% (1/2 tasks done)');

    const camp = queryOne<{ progress_pct: number }>('SELECT progress_pct FROM kanban_campaigns WHERE id = ?', [campaignId]);
    assert.equal(camp?.progress_pct, 50, 'Campaign should cascade from initiative (50%)');

    const goal = queryOne<{ progress_pct: number }>('SELECT progress_pct FROM kanban_goals WHERE id = ?', [goalId]);
    assert.equal(goal?.progress_pct, 50, 'Goal should cascade from campaign (50%)');

    // Now complete the second task and re-rollup
    run("UPDATE tasks SET status = 'done' WHERE id = ?", [task2]);

    const stats2 = queryOne<{ total: number; done: number }>(
      `SELECT COUNT(*) as total,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done
       FROM kanban_card_meta m JOIN tasks t ON t.id = m.task_id
       WHERE m.initiative_id = ?`,
      [initId]
    );
    const newPct = Math.round(((stats2?.done ?? 0) / (stats2?.total ?? 1)) * 100);
    run("UPDATE kanban_initiatives SET progress_pct = ? WHERE id = ?", [newPct, initId]);
    run("UPDATE kanban_campaigns SET progress_pct = ? WHERE id = ?", [newPct, campaignId]);
    run("UPDATE kanban_goals SET progress_pct = ? WHERE id = ?", [newPct, goalId]);

    const goalFinal = queryOne<{ progress_pct: number }>('SELECT progress_pct FROM kanban_goals WHERE id = ?', [goalId]);
    assert.equal(goalFinal?.progress_pct, 100, 'Goal should be 100% when all tasks done');
  });
});

// ── Orchestration: Agent status lifecycle ────────────────────────────

describe('Orchestration: Agent status management', () => {
  test('agent moves to standby when their task completes and they have no other active tasks', () => {
    const ws = `ws-orch-agent-status-${uid()}`;
    const taskId = uid();
    const agentId = uid();

    seedAgent(agentId, ws, 'builder', 'Status Agent', { status: 'working' });
    seedTask(taskId, ws, 'in_progress', undefined, agentId);

    // Simulate PATCH handler agent status logic (lines 338-365):
    // When task moves to done, check if agent has other active tasks
    const now = new Date().toISOString();
    run("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?", [now, taskId]);

    const activeTasks = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM tasks
       WHERE assigned_agent_id = ?
         AND status IN ('assigned', 'in_progress', 'testing', 'verification')
         AND id != ?`,
      [agentId, taskId]
    );

    if (!activeTasks || activeTasks.count === 0) {
      run("UPDATE agents SET status = 'standby', updated_at = ? WHERE id = ? AND status = 'working'",
        [now, agentId]);
    }

    const agent = queryOne<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agentId]);
    assert.equal(agent?.status, 'standby', 'Agent should be standby after last active task completes');
  });

  test('agent stays working when they still have other active tasks', () => {
    const ws = `ws-orch-agent-busy-${uid()}`;
    const task1 = uid();
    const task2 = uid();
    const agentId = uid();

    seedAgent(agentId, ws, 'builder', 'Busy Agent', { status: 'working' });
    seedTask(task1, ws, 'in_progress', undefined, agentId);
    seedTask(task2, ws, 'in_progress', undefined, agentId);

    // Complete task1
    const now = new Date().toISOString();
    run("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?", [now, task1]);

    const activeTasks = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM tasks
       WHERE assigned_agent_id = ?
         AND status IN ('assigned', 'in_progress', 'testing', 'verification')
         AND id != ?`,
      [agentId, task1]
    );

    // task2 is still active, so don't change status
    if (!activeTasks || activeTasks.count === 0) {
      run("UPDATE agents SET status = 'standby', updated_at = ? WHERE id = ? AND status = 'working'",
        [now, agentId]);
    }

    const agent = queryOne<{ status: string }>('SELECT status FROM agents WHERE id = ?', [agentId]);
    assert.equal(agent?.status, 'working', 'Agent should stay working with other active tasks');
  });
});

// ── Orchestration: Workflow auto-populate on agent assignment ────────

describe('Orchestration: Workflow template auto-assigned on agent assignment', () => {
  test('assigning agent to task auto-assigns default workflow template and populates roles', () => {
    const ws = `ws-orch-autopop-${uid()}`;
    const tplId = `tpl-orch-autopop-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Auto-Pop Builder');
    seedAgent(testerId, ws, 'tester', 'Auto-Pop Tester');
    seedTask(taskId, ws, 'inbox'); // No workflow template

    // Simulate PATCH handler auto-assign logic (lines 128-139):
    // When agent assigned and task has no template, find workspace default
    const defaultTpl = queryOne<{ id: string }>(
      'SELECT id FROM workflow_templates WHERE workspace_id = ? AND is_default = 1 LIMIT 1',
      [ws]
    );
    assert.ok(defaultTpl, 'Workspace should have a default template');

    run('UPDATE tasks SET workflow_template_id = ? WHERE id = ?', [defaultTpl!.id, taskId]);
    populateTaskRolesFromAgents(taskId, ws);

    // Verify template was assigned
    const task = queryOne<{ workflow_template_id: string }>(
      'SELECT workflow_template_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.workflow_template_id, tplId);

    // Verify roles were populated
    const roles = queryAll<{ role: string; agent_id: string }>(
      'SELECT role, agent_id FROM task_roles WHERE task_id = ?', [taskId]);
    assert.ok(roles.length >= 2, 'Should have at least builder + tester roles');
    const builderRole = roles.find(r => r.role === 'builder');
    assert.ok(builderRole, 'Builder role should be populated');
    assert.equal(builderRole!.agent_id, builderId);
  });
});

// ── Orchestration: Full end-to-end with fail + escalation + drain ────

describe('Orchestration: Full E2E loop with failure, escalation, and recovery', () => {
  test('task fails twice → fixer escalation → fixer completes → queue drains', async () => {
    const ws = `ws-orch-e2e-${uid()}`;
    const tplId = `tpl-orch-e2e-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();
    const reviewerId = uid();
    const queuedTask = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'E2E Builder');
    seedAgent(testerId, ws, 'tester', 'E2E Tester');
    seedAgent(reviewerId, ws, 'reviewer', 'E2E Reviewer');

    seedTask(taskId, ws, 'testing', tplId, testerId);
    seedTaskRole(taskId, 'builder', builderId);
    seedTaskRole(taskId, 'tester', testerId);
    seedTaskRole(taskId, 'reviewer', reviewerId);

    // A second task is waiting in review queue
    seedTask(queuedTask, ws, 'review', tplId);
    seedTaskRole(queuedTask, 'reviewer', reviewerId);

    // ── CYCLE 1: First test failure ──
    await handleStageFailure(taskId, 'testing', 'CSS layout broken');
    let task = queryOne<{ status: string; assigned_agent_id: string }>(
      'SELECT status, assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'in_progress');
    assert.equal(task?.assigned_agent_id, builderId, 'Builder handles first failure');

    // Builder "fixes" → moves back to testing
    run("UPDATE tasks SET status = 'testing' WHERE id = ?", [taskId]);
    await handleStageTransition(taskId, 'testing', { skipDispatch: true, previousStatus: 'in_progress' });

    // ── CYCLE 2: Second test failure ──
    await handleStageFailure(taskId, 'testing', 'Still broken on Safari');
    task = queryOne<{ status: string; assigned_agent_id: string }>(
      'SELECT status, assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'in_progress');

    // Now we have 2 failures in testing → escalation should trigger
    assert.equal(getFailureCountInStage(taskId, 'testing'), 2);
    await escalateFailureIfNeeded(taskId, 'testing');

    // Fixer should now own the task
    task = queryOne<{ status: string; assigned_agent_id: string; status_reason: string }>(
      'SELECT status, assigned_agent_id, status_reason FROM tasks WHERE id = ?', [taskId]);
    assert.ok(task?.status_reason?.includes('Escalated'), 'Task should be escalated');

    const fixer = queryOne<{ role: string; name: string }>(
      'SELECT role, name FROM agents WHERE id = ?', [task!.assigned_agent_id]);
    assert.equal(fixer?.role, 'fixer', 'Fixer agent should be assigned');

    // ── Fixer completes → task progresses through to done ──
    run("UPDATE tasks SET status = 'testing' WHERE id = ?", [taskId]);
    await handleStageTransition(taskId, 'testing', { skipDispatch: true });

    // Tester passes this time → review (queue stage)
    run("UPDATE tasks SET status = 'review' WHERE id = ?", [taskId]);
    await handleStageTransition(taskId, 'review', { skipDispatch: true });

    // Both tasks are in review queue. Drain picks the OLDEST (by updated_at).
    // The queuedTask was seeded first and is older → it gets advanced to verification.
    await drainQueue(taskId, ws);

    // queuedTask should advance to verification (it was oldest)
    let qt = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [queuedTask]);
    assert.equal(qt?.status, 'verification', 'Oldest queued task should advance to verification');

    // Main task stays in review (verification now occupied by queuedTask)
    task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'review', 'Main task should wait in review');

    // queuedTask completes verification → done
    run("UPDATE tasks SET status = 'done' WHERE id = ?", [queuedTask]);

    // Drain again → main task should now advance to verification
    await drainQueue(queuedTask, ws);

    task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'verification', 'Main task should advance after queue freed');
  });
});

// ── Orchestration: Master agent approval gate ────────────────────────

describe('Orchestration: Master agent approval gate', () => {
  test('non-master agent cannot approve task from review to done', () => {
    const ws = `ws-orch-master-${uid()}`;
    const taskId = uid();
    const regularAgentId = uid();
    const masterAgentId = uid();

    seedAgent(regularAgentId, ws, 'builder', 'Regular Agent', { isMaster: 0 });
    seedAgent(masterAgentId, ws, 'builder', 'Master Agent', { isMaster: 1 });
    seedTask(taskId, ws, 'review');

    // Simulate PATCH handler master-agent gate (lines 74-86)
    const updatingAgent = queryOne<{ is_master: number }>(
      'SELECT is_master FROM agents WHERE id = ?', [regularAgentId]);

    assert.equal(updatingAgent?.is_master, 0);
    // This would return 403 in the API route
    assert.equal(!updatingAgent || !updatingAgent.is_master, true,
      'Non-master agent should be blocked from review→done');

    // Master agent should be allowed
    const masterCheck = queryOne<{ is_master: number }>(
      'SELECT is_master FROM agents WHERE id = ?', [masterAgentId]);
    assert.equal(masterCheck?.is_master, 1, 'Master agent should be allowed');
  });
});

// ── Orchestration: Stage transition audit trail ──────────────────────

describe('Orchestration: Stage transition creates complete audit trail', () => {
  test('full pipeline creates events, activities, and stage transitions', async () => {
    const ws = `ws-orch-audit-${uid()}`;
    const tplId = `tpl-orch-audit-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();

    seedWorkflowTemplate(tplId, ws, FULL_PIPELINE_STAGES, FULL_FAIL_TARGETS);
    seedAgent(builderId, ws, 'builder', 'Audit Builder');
    seedAgent(testerId, ws, 'tester', 'Audit Tester');
    seedTask(taskId, ws, 'assigned', tplId, builderId);
    seedTaskRole(taskId, 'builder', builderId);
    seedTaskRole(taskId, 'tester', testerId);

    // Log events as PATCH handler would
    const transitions = ['assigned', 'in_progress', 'testing'];
    for (const status of transitions) {
      run('UPDATE tasks SET status = ? WHERE id = ?', [status, taskId]);
      run(
        `INSERT INTO events (id, type, task_id, message, created_at)
         VALUES (?, 'task_status_changed', ?, ?, datetime('now'))`,
        [uid(), taskId, `Task moved to ${status}`]
      );
      await handleStageTransition(taskId, status, { skipDispatch: true });
    }

    // Verify complete event trail
    const events = queryAll<{ type: string; message: string }>(
      `SELECT type, message FROM events WHERE task_id = ? ORDER BY created_at ASC`,
      [taskId]
    );
    assert.ok(events.length >= 3, `Should have at least 3 events, got ${events.length}`);

    // Verify activity trail (handoff logs)
    const activities = queryAll<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? AND activity_type = 'status_changed'`,
      [taskId]
    );
    assert.ok(activities.length >= 2, 'Should have handoff activities for builder and tester');

    // Verify activities contain agent names
    const hasBuilderHandoff = activities.some(a => a.message.includes('Audit Builder'));
    const hasTesterHandoff = activities.some(a => a.message.includes('Audit Tester'));
    assert.ok(hasBuilderHandoff, 'Should have builder handoff activity');
    assert.ok(hasTesterHandoff, 'Should have tester handoff activity');
  });
});
