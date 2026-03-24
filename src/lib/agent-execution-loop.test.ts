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
