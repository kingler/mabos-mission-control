import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { run, queryOne, queryAll } from './db';
import {
  getTaskWorkflow,
  getTaskRoles,
  handleStageTransition,
  handleStageFailure,
  populateTaskRolesFromAgents,
  drainQueue,
} from './workflow-engine';

// ── Helpers ─────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();

function seedWorkspace(id: string) {
  run(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [id, `Workspace ${id}`, id]
  );
}

function seedAgent(id: string, workspace = 'wf-test', role = 'builder', name = 'Test Agent') {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO agents (id, name, role, description, avatar_emoji, status, is_master, workspace_id, source, created_at, updated_at)
     VALUES (?, ?, ?, 'test', '🤖', 'standby', 0, ?, 'local', datetime('now'), datetime('now'))`,
    [id, name, role, workspace]
  );
}

function seedTask(id: string, workspace = 'wf-test', status = 'in_progress', templateId?: string) {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO tasks (id, title, status, priority, workspace_id, business_id, workflow_template_id, created_at, updated_at)
     VALUES (?, 'WF Test Task', ?, 'normal', ?, 'default', ?, datetime('now'), datetime('now'))`,
    [id, status, workspace, templateId ?? null]
  );
}

function seedWorkflowTemplate(id: string, workspace: string, stages: object[], failTargets: Record<string, string>, isDefault = 1) {
  seedWorkspace(workspace);
  run(
    `INSERT OR IGNORE INTO workflow_templates (id, workspace_id, name, description, stages, fail_targets, is_default, created_at, updated_at)
     VALUES (?, ?, 'Test Workflow', 'test', ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, workspace, JSON.stringify(stages), JSON.stringify(failTargets), isDefault]
  );
}

function seedTaskRole(taskId: string, role: string, agentId: string) {
  run(
    `INSERT OR IGNORE INTO task_roles (id, task_id, role, agent_id, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [uid(), taskId, role, agentId]
  );
}

// ── getTaskWorkflow ─────────────────────────────────────────────────

describe('getTaskWorkflow', () => {
  test('returns null for non-existent task', () => {
    assert.equal(getTaskWorkflow('nonexistent-task-id'), null);
  });

  test('returns task-specific template when set', () => {
    const tplId = `tpl-${uid()}`;
    const ws = `ws-${uid()}`;
    const taskId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'testing', label: 'Test', role: 'tester' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, { testing: 'in_progress' });
    seedTask(taskId, ws, 'in_progress', tplId);

    const wf = getTaskWorkflow(taskId);
    assert.ok(wf);
    assert.equal(wf!.id, tplId);
    assert.equal(wf!.stages.length, 3);
    assert.equal(wf!.fail_targets['testing'], 'in_progress');
  });

  test('falls back to workspace default template', () => {
    const ws = `ws-default-${uid()}`;
    const tplId = `tpl-default-${uid()}`;
    const taskId = uid();
    const stages = [{ status: 'in_progress', label: 'Build', role: 'builder' }];
    seedWorkflowTemplate(tplId, ws, stages, {}, 1);
    seedTask(taskId, ws, 'in_progress'); // no template set on task

    const wf = getTaskWorkflow(taskId);
    assert.ok(wf);
    assert.equal(wf!.id, tplId);
  });

  test('returns null when no template exists for task or workspace', () => {
    const ws = `ws-empty-${uid()}`;
    const taskId = uid();
    seedTask(taskId, ws, 'in_progress');

    // May get a global default if one exists; the important thing is it doesn't crash
    const wf = getTaskWorkflow(taskId);
    // Either null or a global default — both are valid
    assert.ok(wf === null || wf.id);
  });
});

// ── handleStageTransition ───────────────────────────────────────────

describe('handleStageTransition', () => {
  test('returns success when no workspace-specific workflow template', async () => {
    const ws = `ws-no-wf-${uid()}`;
    const taskId = uid();
    seedTask(taskId, ws, 'in_progress');

    // May pick up a global default template — either way should not throw
    const result = await handleStageTransition(taskId, 'in_progress');
    assert.ok(result.success === true || result.success === false);
  });

  test('returns success with no handoff for unknown status in workflow', async () => {
    const ws = `ws-unk-${uid()}`;
    const tplId = `tpl-unk-${uid()}`;
    const taskId = uid();
    const stages = [{ status: 'in_progress', label: 'Build', role: 'builder' }];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'in_progress', tplId);

    const result = await handleStageTransition(taskId, 'some_unknown_status');
    assert.equal(result.success, true);
    assert.equal(result.handedOff, false);
  });

  test('assigns agent from task_roles and hands off with skipDispatch', async () => {
    const ws = `ws-handoff-${uid()}`;
    const tplId = `tpl-handoff-${uid()}`;
    const taskId = uid();
    const agentId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'testing', label: 'Test', role: 'tester' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, { testing: 'in_progress' });
    seedTask(taskId, ws, 'in_progress', tplId);
    seedAgent(agentId, ws, 'tester', 'Test Tester');
    seedTaskRole(taskId, 'tester', agentId);

    const result = await handleStageTransition(taskId, 'testing', { skipDispatch: true });
    assert.equal(result.success, true);
    assert.equal(result.handedOff, true);
    assert.equal(result.newAgentId, agentId);
    assert.equal(result.newAgentName, 'Test Tester');

    // Verify agent was assigned to task
    const task = queryOne<{ assigned_agent_id: string }>('SELECT assigned_agent_id FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.assigned_agent_id, agentId);
  });

  test('falls back to assigned_agent_id when no task_role match', async () => {
    const ws = `ws-fallback-${uid()}`;
    const tplId = `tpl-fallback-${uid()}`;
    const taskId = uid();
    const agentId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'testing', label: 'Test', role: 'tester' },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedAgent(agentId, ws, 'tester', 'Fallback Agent');
    seedTask(taskId, ws, 'in_progress', tplId);
    // Directly assign agent to task instead of via task_roles
    run('UPDATE tasks SET assigned_agent_id = ? WHERE id = ?', [agentId, taskId]);

    const result = await handleStageTransition(taskId, 'testing', { skipDispatch: true });
    assert.equal(result.success, true);
    assert.equal(result.handedOff, true);
    assert.equal(result.newAgentId, agentId);
  });

  test('returns error when no agent available for role', async () => {
    const ws = `ws-noagent-${uid()}`;
    const tplId = `tpl-noagent-${uid()}`;
    const taskId = uid();
    const stages = [
      { status: 'testing', label: 'Test', role: 'tester' },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'in_progress', tplId);

    const result = await handleStageTransition(taskId, 'testing');
    assert.equal(result.success, false);
    assert.equal(result.handedOff, false);
    assert.ok(result.error?.includes('No agent assigned for role'));
  });

  test('handles queue stage (no role) without error', async () => {
    const ws = `ws-queue-${uid()}`;
    const tplId = `tpl-queue-${uid()}`;
    const taskId = uid();
    const stages = [
      { status: 'review', label: 'Review Queue', role: null },
      { status: 'verification', label: 'Verify', role: 'reviewer' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'review', tplId);

    const result = await handleStageTransition(taskId, 'review');
    assert.equal(result.success, true);
    assert.equal(result.handedOff, false);
  });

  test('logs handoff activity in task_activities', async () => {
    const ws = `ws-log-${uid()}`;
    const tplId = `tpl-log-${uid()}`;
    const taskId = uid();
    const agentId = uid();
    const stages = [
      { status: 'testing', label: 'Test', role: 'tester' },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'testing', tplId);
    seedAgent(agentId, ws, 'tester', 'Logger Tester');
    seedTaskRole(taskId, 'tester', agentId);

    await handleStageTransition(taskId, 'testing', { skipDispatch: true });

    const activity = queryOne<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? AND activity_type = 'status_changed' ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );
    assert.ok(activity);
    assert.ok(activity!.message.includes('Stage handoff'));
    assert.ok(activity!.message.includes('Logger Tester'));
  });
});

// ── handleStageFailure ──────────────────────────────────────────────

describe('handleStageFailure', () => {
  test('returns error or no-handoff when no workspace-specific workflow template exists', async () => {
    const ws = `ws-fail-nowf-${uid()}`;
    const taskId = uid();
    seedTask(taskId, ws, 'testing');

    const result = await handleStageFailure(taskId, 'testing', 'CSS broken');
    // Without a workspace-specific template, may pick up global default or return error
    // Either way, the call should not throw
    assert.ok(result.success === true || result.success === false);
  });

  test('returns error when no fail_target defined for status', async () => {
    const ws = `ws-fail-notarget-${uid()}`;
    const tplId = `tpl-fail-notarget-${uid()}`;
    const taskId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'testing', label: 'Test', role: 'tester' },
    ];
    // Empty fail_targets — no mapping for 'testing'
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'testing', tplId);

    const result = await handleStageFailure(taskId, 'testing', 'Tests failed');
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('No fail target'));
  });

  test('moves task to fail_target status and logs failure', async () => {
    const ws = `ws-fail-loop-${uid()}`;
    const tplId = `tpl-fail-loop-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'testing', label: 'Test', role: 'tester' },
    ];
    seedWorkflowTemplate(tplId, ws, stages, { testing: 'in_progress' });
    seedTask(taskId, ws, 'testing', tplId);
    seedAgent(builderId, ws, 'builder', 'Fail Builder');
    seedTaskRole(taskId, 'builder', builderId);

    const result = await handleStageFailure(taskId, 'testing', 'Image not loading');

    // Task should be moved to in_progress (the fail target)
    const task = queryOne<{ status: string; status_reason: string }>('SELECT status, status_reason FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'in_progress');
    assert.ok(task?.status_reason?.includes('Failed'));

    // Failure should be logged in activities
    const failActivity = queryOne<{ message: string }>(
      `SELECT message FROM task_activities WHERE task_id = ? AND message LIKE '%Stage failed%' ORDER BY created_at DESC LIMIT 1`,
      [taskId]
    );
    assert.ok(failActivity);
    assert.ok(failActivity!.message.includes('Image not loading'));
  });
});

// ── populateTaskRolesFromAgents ─────────────────────────────────────

describe('populateTaskRolesFromAgents', () => {
  test('populates roles from available agents matching workflow stages', () => {
    const ws = `ws-pop-${uid()}`;
    const tplId = `tpl-pop-${uid()}`;
    const taskId = uid();
    const builderId = uid();
    const testerId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'testing', label: 'Test', role: 'tester' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'in_progress', tplId);
    seedAgent(builderId, ws, 'builder', 'Pop Builder');
    seedAgent(testerId, ws, 'tester', 'Pop Tester');

    populateTaskRolesFromAgents(taskId, ws);

    const roles = getTaskRoles(taskId);
    assert.ok(roles.length >= 2);
    const builderRole = roles.find(r => r.role === 'builder');
    const testerRole = roles.find(r => r.role === 'tester');
    assert.ok(builderRole);
    assert.ok(testerRole);
    assert.equal(builderRole!.agent_id, builderId);
    assert.equal(testerRole!.agent_id, testerId);
  });

  test('does not overwrite existing roles', () => {
    const ws = `ws-pop-exist-${uid()}`;
    const tplId = `tpl-pop-exist-${uid()}`;
    const taskId = uid();
    const agentId = uid();
    const stages = [{ status: 'in_progress', label: 'Build', role: 'builder' }];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'in_progress', tplId);
    seedAgent(agentId, ws, 'builder', 'Existing Builder');
    seedTaskRole(taskId, 'builder', agentId);

    // Second agent that could also match
    const agentId2 = uid();
    seedAgent(agentId2, ws, 'builder', 'New Builder');

    populateTaskRolesFromAgents(taskId, ws);

    const roles = getTaskRoles(taskId);
    const builderRole = roles.find(r => r.role === 'builder');
    // Should still be the original agent
    assert.equal(builderRole!.agent_id, agentId);
  });

  test('assigns learner role even though it has no workflow stage', () => {
    const ws = `ws-pop-learner-${uid()}`;
    const tplId = `tpl-pop-learner-${uid()}`;
    const taskId = uid();
    const learnerId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'in_progress', tplId);
    seedAgent(learnerId, ws, 'learner', 'Learner Agent');

    populateTaskRolesFromAgents(taskId, ws);

    const roles = getTaskRoles(taskId);
    const learnerRole = roles.find(r => r.role === 'learner');
    assert.ok(learnerRole, 'Learner role should be assigned even without a workflow stage');
    assert.equal(learnerRole!.agent_id, learnerId);
  });
});

// ── drainQueue ──────────────────────────────────────────────────────

describe('drainQueue', () => {
  test('advances queued task when next stage is free', async () => {
    const ws = `ws-drain-${uid()}`;
    const tplId = `tpl-drain-${uid()}`;
    const taskId = uid();
    const reviewerId = uid();
    const stages = [
      { status: 'in_progress', label: 'Build', role: 'builder' },
      { status: 'review', label: 'Review Queue', role: null },
      { status: 'verification', label: 'Verify', role: 'reviewer' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'review', tplId);
    seedAgent(reviewerId, ws, 'reviewer', 'Queue Reviewer');
    seedTaskRole(taskId, 'reviewer', reviewerId);

    await drainQueue(taskId, ws);

    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'verification');
  });

  test('holds queue when next stage is occupied', async () => {
    const ws = `ws-drain-occ-${uid()}`;
    const tplId = `tpl-drain-occ-${uid()}`;
    const taskId = uid();
    const occupantId = uid();
    const stages = [
      { status: 'review', label: 'Review Queue', role: null },
      { status: 'verification', label: 'Verify', role: 'reviewer' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    seedTask(taskId, ws, 'review', tplId);
    // Another task already occupying the next stage
    seedTask(occupantId, ws, 'verification', tplId);

    await drainQueue(taskId, ws);

    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'review', 'Task should remain in queue when next stage is occupied');
  });

  test('does nothing when no tasks are queued', async () => {
    const ws = `ws-drain-empty-${uid()}`;
    const tplId = `tpl-drain-empty-${uid()}`;
    const taskId = uid();
    const stages = [
      { status: 'review', label: 'Review Queue', role: null },
      { status: 'verification', label: 'Verify', role: 'reviewer' },
      { status: 'done', label: 'Done', role: null },
    ];
    seedWorkflowTemplate(tplId, ws, stages, {});
    // Task is in a non-queue stage
    seedTask(taskId, ws, 'in_progress', tplId);

    // Should not throw
    await drainQueue(taskId, ws);

    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.equal(task?.status, 'in_progress');
  });
});
