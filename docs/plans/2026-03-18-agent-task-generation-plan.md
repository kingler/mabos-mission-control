# Agent-Driven Task Generation & Delegation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable MABOS agents to create, delegate, and execute tasks linked to the 4-tier kanban hierarchy, populating `kanban_card_meta` so goal cards show real task counts and progress.

**Architecture:** 5 new MC API endpoints receive agent tool calls over HTTP. 6 new MABOS plugin tools call those endpoints. Each task created automatically links to the kanban hierarchy via `kanban_card_meta`. Task completion triggers rollup (Tasks → Initiatives → Campaigns → Goals). BDI cycle gets a task assessment phase.

**Tech Stack:** Next.js API routes (MC), TypeScript, better-sqlite3, Typebox schemas (MABOS tools), OpenClaw plugin API

**Repos:**
- Mission Control: `/Users/kinglerbercy/mission-control/` (port 4000)
- OpenClaw-MABOS: `/Users/kinglerbercy/openclaw-mabos/`

**Design Doc:** `docs/plans/2026-03-18-agent-task-generation-design.md`

---

## Task 1: `GET /api/kanban/goals/[id]/status` — Goal Health Check

The read-only endpoint that agents call to assess task gaps. No side effects — safest to build first.

**Files:**
- Create: `src/app/api/kanban/goals/[id]/status/route.ts`

**Step 1: Create the route file**

```typescript
// src/app/api/kanban/goals/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface GoalStatusRow {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
  domain: string;
  owner_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
}

interface InitiativeRow {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
  campaign_id: string;
}

/**
 * GET /api/kanban/goals/:id/status — Goal health check for agents
 * Returns hierarchy status: goal → campaigns → initiatives → tasks
 * Also works for campaign_id and initiative_id via query params
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier') || 'goal';

    if (tier === 'initiative') {
      // Initiative-level status: just tasks
      const initiative = db.prepare(
        'SELECT id, title, stage, progress_pct, campaign_id FROM kanban_initiatives WHERE id = ?'
      ).get(id) as InitiativeRow | undefined;

      if (!initiative) {
        return NextResponse.json({ error: `Initiative ${id} not found` }, { status: 404 });
      }

      const tasks = db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.assigned_agent_id, t.updated_at
        FROM tasks t
        JOIN kanban_card_meta m ON m.task_id = t.id
        WHERE m.initiative_id = ?
        ORDER BY t.priority DESC, t.created_at ASC
      `).all(id) as TaskRow[];

      const taskStats = {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        blocked: tasks.filter(t => t.status === 'review' || t.status === 'verification').length,
      };

      return NextResponse.json({ initiative, tasks, taskStats });
    }

    if (tier === 'campaign') {
      // Campaign-level status: initiatives + their tasks
      const campaign = db.prepare(
        'SELECT id, title, stage, progress_pct FROM kanban_campaigns WHERE id = ?'
      ).get(id) as CampaignRow | undefined;

      if (!campaign) {
        return NextResponse.json({ error: `Campaign ${id} not found` }, { status: 404 });
      }

      const initiatives = db.prepare(
        'SELECT id, title, stage, progress_pct, campaign_id FROM kanban_initiatives WHERE campaign_id = ?'
      ).all(id) as InitiativeRow[];

      const tasks = db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.assigned_agent_id, t.updated_at
        FROM tasks t
        JOIN kanban_card_meta m ON m.task_id = t.id
        WHERE m.campaign_id = ?
        ORDER BY t.priority DESC, t.created_at ASC
      `).all(id) as TaskRow[];

      const taskStats = {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        blocked: tasks.filter(t => t.status === 'review' || t.status === 'verification').length,
      };

      return NextResponse.json({ campaign, initiatives, tasks, taskStats });
    }

    // Default: goal-level status — full hierarchy
    const goal = db.prepare(
      'SELECT id, title, stage, progress_pct, domain, owner_id FROM kanban_goals WHERE id = ?'
    ).get(id) as GoalStatusRow | undefined;

    if (!goal) {
      return NextResponse.json({ error: `Goal ${id} not found` }, { status: 404 });
    }

    const campaigns = db.prepare(
      'SELECT id, title, stage, progress_pct FROM kanban_campaigns WHERE goal_id = ?'
    ).all(id) as CampaignRow[];

    const initiatives = db.prepare(
      'SELECT id, title, stage, progress_pct, campaign_id FROM kanban_initiatives WHERE goal_id = ?'
    ).all(id) as InitiativeRow[];

    const tasks = db.prepare(`
      SELECT t.id, t.title, t.status, t.priority, t.assigned_agent_id, t.updated_at
      FROM tasks t
      JOIN kanban_card_meta m ON m.task_id = t.id
      WHERE m.goal_id = ?
      ORDER BY t.priority DESC, t.created_at ASC
    `).all(id) as TaskRow[];

    const taskStats = {
      total: tasks.length,
      done: tasks.filter(t => t.status === 'done').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.status === 'review' || t.status === 'verification').length,
    };

    return NextResponse.json({
      goal,
      campaigns,
      initiatives,
      tasks,
      taskStats,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/kinglerbercy/mission-control && npx tsc --noEmit src/app/api/kanban/goals/\[id\]/status/route.ts 2>&1 | head -20`
Expected: No errors (or only unrelated warnings)

**Step 3: Test manually**

Run: `curl -s http://localhost:4000/api/kanban/goals/G-S001/status | jq .`
Expected: JSON with goal, campaigns, initiatives, tasks (tasks array likely empty until Task 3 populates card_meta)

**Step 4: Commit**

```bash
git add src/app/api/kanban/goals/\[id\]/status/route.ts
git commit -m "feat: add GET /api/kanban/goals/:id/status endpoint for agent goal health checks"
```

---

## Task 2: `POST /api/kanban/tasks/create` — Single Task Creation + Hierarchy Linking

The core endpoint that populates `kanban_card_meta`. Every agent-created task goes through here.

**Files:**
- Create: `src/app/api/kanban/tasks/create/route.ts`

**Step 1: Create the route file**

```typescript
// src/app/api/kanban/tasks/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface CreateTaskBody {
  title: string;
  description?: string;
  goalId: string;
  campaignId?: string;
  initiativeId?: string;
  assignedAgentId?: string;
  createdByAgentId: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedDuration?: string;
  domain?: string;
  workspaceId?: string;
  dependsOn?: string;
}

/**
 * POST /api/kanban/tasks/create — Agent creates a task linked to kanban hierarchy
 * This is the key endpoint that populates kanban_card_meta (the missing bridge).
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body: CreateTaskBody = await request.json();

    const { title, description, goalId, campaignId, initiativeId,
            assignedAgentId, createdByAgentId, priority, estimatedDuration,
            domain, workspaceId, dependsOn } = body;

    // Validate required fields
    if (!title || !goalId || !createdByAgentId) {
      return NextResponse.json(
        { error: 'Required: title, goalId, createdByAgentId' },
        { status: 400 }
      );
    }

    // Validate goal exists
    const goal = db.prepare('SELECT id, business_id, domain FROM kanban_goals WHERE id = ?')
      .get(goalId) as { id: string; business_id: string; domain: string } | undefined;
    if (!goal) {
      return NextResponse.json({ error: `Goal ${goalId} not found` }, { status: 404 });
    }

    // Validate campaign if provided
    if (campaignId) {
      const campaign = db.prepare('SELECT id FROM kanban_campaigns WHERE id = ? AND goal_id = ?')
        .get(campaignId, goalId);
      if (!campaign) {
        return NextResponse.json({ error: `Campaign ${campaignId} not found under goal ${goalId}` }, { status: 404 });
      }
    }

    // Validate initiative if provided
    if (initiativeId) {
      const initiative = db.prepare('SELECT id FROM kanban_initiatives WHERE id = ?')
        .get(initiativeId);
      if (!initiative) {
        return NextResponse.json({ error: `Initiative ${initiativeId} not found` }, { status: 404 });
      }
    }

    const taskId = uuidv4();
    const now = new Date().toISOString();
    const ws = workspaceId || 'default';
    const initialStatus = assignedAgentId ? 'assigned' : 'inbox';

    // 1. Insert task
    db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id,
        workspace_id, business_id, origin, estimated_duration, depends_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'mabos-agent', ?, ?, ?, ?)
    `).run(
      taskId, title, description || null, initialStatus,
      priority || 'normal', assignedAgentId || null, createdByAgentId,
      ws, goal.business_id, estimatedDuration || null, dependsOn || null,
      now, now
    );

    // 2. Insert kanban_card_meta (THE MISSING LINK)
    db.prepare(`
      INSERT INTO kanban_card_meta (task_id, goal_id, campaign_id, initiative_id, meta_type, domain)
      VALUES (?, ?, ?, ?, 'operational', ?)
    `).run(taskId, goalId, campaignId || null, initiativeId || null, domain || goal.domain);

    // 3. Log event
    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, 'task_created', ?, ?, ?, ?)
    `).run(uuidv4(), createdByAgentId, taskId, `Agent created task: ${title}`, now);

    // 4. BDI log entry
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary)
      VALUES (?, ?, ?, 'action', 'action_executed', 'task', ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`, createdByAgentId, goal.business_id,
      taskId, `Task created: ${title} [goal:${goalId}]`
    );

    // 5. Broadcast SSE
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_created', payload: task });

    // 6. Trigger rollup (non-blocking)
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
    fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
      console.error('[TaskCreate] Rollup trigger failed:', err)
    );

    return NextResponse.json({ taskId, status: initialStatus, goalId, campaignId, initiativeId }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 2: Test with curl**

```bash
curl -s -X POST http://localhost:4000/api/kanban/tasks/create \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test task from agent","goalId":"G-S001","createdByAgentId":"vw-cmo","description":"Testing task creation"}' \
  | jq .
```

Expected: `{ "taskId": "...", "status": "inbox", "goalId": "G-S001" }`

**Step 3: Verify kanban_card_meta was populated**

```bash
curl -s http://localhost:4000/api/kanban/goals/G-S001/status | jq '.taskStats'
```

Expected: `{ "total": 1, "done": 0, "in_progress": 0, "blocked": 0 }`

**Step 4: Commit**

```bash
git add src/app/api/kanban/tasks/create/route.ts
git commit -m "feat: add POST /api/kanban/tasks/create — links tasks to kanban hierarchy via card_meta"
```

---

## Task 3: `POST /api/kanban/tasks/decompose` — Bulk Task Creation from Plan

Accepts an array of tasks, creates them all in a transaction, links to hierarchy. This is what `decompose_goal` tool calls.

**Files:**
- Create: `src/app/api/kanban/tasks/decompose/route.ts`

**Step 1: Create the route file**

```typescript
// src/app/api/kanban/tasks/decompose/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface ProposedTask {
  title: string;
  description?: string;
  assignedAgentId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  estimatedDuration?: string;
  dependsOnIndex?: number; // index into proposedTasks array for ordering
}

interface DecomposeBody {
  goalId: string;
  campaignId?: string;
  initiativeId?: string;
  agentId: string; // the agent performing the decomposition
  analysis?: string; // research/reasoning that led to this plan
  proposedTasks: ProposedTask[];
}

/**
 * POST /api/kanban/tasks/decompose — Bulk task creation from agent plan
 * Creates multiple tasks in a transaction, all linked to the kanban hierarchy.
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body: DecomposeBody = await request.json();

    const { goalId, campaignId, initiativeId, agentId, analysis, proposedTasks } = body;

    if (!goalId || !agentId || !proposedTasks?.length) {
      return NextResponse.json(
        { error: 'Required: goalId, agentId, proposedTasks (non-empty array)' },
        { status: 400 }
      );
    }

    if (proposedTasks.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 tasks per decomposition' },
        { status: 400 }
      );
    }

    // Validate goal exists
    const goal = db.prepare('SELECT id, business_id, domain FROM kanban_goals WHERE id = ?')
      .get(goalId) as { id: string; business_id: string; domain: string } | undefined;
    if (!goal) {
      return NextResponse.json({ error: `Goal ${goalId} not found` }, { status: 404 });
    }

    const now = new Date().toISOString();
    const createdTasks: { taskId: string; title: string; index: number }[] = [];

    // Transaction: create all tasks atomically
    const createAll = db.transaction(() => {
      // First pass: create all tasks and collect IDs
      const taskIds: string[] = [];
      for (let i = 0; i < proposedTasks.length; i++) {
        const pt = proposedTasks[i];
        const taskId = uuidv4();
        taskIds.push(taskId);
        const initialStatus = pt.assignedAgentId ? 'assigned' : 'inbox';

        db.prepare(`
          INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id,
            workspace_id, business_id, origin, estimated_duration, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'default', ?, 'mabos-agent', ?, ?, ?)
        `).run(
          taskId, pt.title, pt.description || null, initialStatus,
          pt.priority || 'normal', pt.assignedAgentId || null, agentId,
          goal.business_id, pt.estimatedDuration || null, now, now
        );

        // Link to kanban hierarchy
        db.prepare(`
          INSERT INTO kanban_card_meta (task_id, goal_id, campaign_id, initiative_id, meta_type, domain)
          VALUES (?, ?, ?, ?, 'operational', ?)
        `).run(taskId, goalId, campaignId || null, initiativeId || null, goal.domain);

        createdTasks.push({ taskId, title: pt.title, index: i });
      }

      // Second pass: set depends_on for sequential tasks
      for (let i = 0; i < proposedTasks.length; i++) {
        const pt = proposedTasks[i];
        if (pt.dependsOnIndex !== undefined && pt.dependsOnIndex >= 0 && pt.dependsOnIndex < i) {
          db.prepare('UPDATE tasks SET depends_on = ? WHERE id = ?')
            .run(taskIds[pt.dependsOnIndex], taskIds[i]);
        }
      }

      // Log the decomposition as a BDI event
      db.prepare(`
        INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details)
        VALUES (?, ?, ?, 'intention', 'plan_selected', ?, ?, ?, ?)
      `).run(
        `bdi-${uuidv4().slice(0, 8)}`, agentId, goal.business_id,
        initiativeId ? 'initiative' : (campaignId ? 'campaign' : 'goal'),
        initiativeId || campaignId || goalId,
        `Decomposed into ${proposedTasks.length} tasks`,
        analysis || null
      );
    });

    createAll();

    // Broadcast SSE for each created task
    for (const ct of createdTasks) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(ct.taskId);
      broadcast({ type: 'task_created', payload: task });
    }

    // Trigger rollup
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
    fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
      console.error('[Decompose] Rollup trigger failed:', err)
    );

    return NextResponse.json({
      created: createdTasks.length,
      tasks: createdTasks,
      goalId,
      campaignId: campaignId || null,
      initiativeId: initiativeId || null,
    }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 2: Test with curl**

```bash
curl -s -X POST http://localhost:4000/api/kanban/tasks/decompose \
  -H 'Content-Type: application/json' \
  -d '{
    "goalId":"G-S001",
    "agentId":"vw-cmo",
    "analysis":"Market research indicates need for multi-channel approach",
    "proposedTasks":[
      {"title":"Research ad creatives","assignedAgentId":"vw-sales-research","priority":"high"},
      {"title":"Build audience segments","assignedAgentId":"vw-lead-gen","priority":"normal"},
      {"title":"Launch campaigns","assignedAgentId":"vw-outreach","priority":"normal","dependsOnIndex":0}
    ]
  }' | jq .
```

Expected: `{ "created": 3, "tasks": [...], "goalId": "G-S001" }`

**Step 3: Verify hierarchy linking**

```bash
curl -s http://localhost:4000/api/kanban/goals/G-S001/status | jq '.taskStats'
```

Expected: total count increased by 3

**Step 4: Commit**

```bash
git add src/app/api/kanban/tasks/decompose/route.ts
git commit -m "feat: add POST /api/kanban/tasks/decompose — bulk task creation from agent plans"
```

---

## Task 4: `POST /api/kanban/tasks/delegate` — Task Delegation

Assigns a task to a sub-agent with instructions. Updates task status and creates a message thread.

**Files:**
- Create: `src/app/api/kanban/tasks/delegate/route.ts`

**Step 1: Create the route file**

```typescript
// src/app/api/kanban/tasks/delegate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface DelegateBody {
  taskId: string;
  targetAgentId: string;
  delegatingAgentId: string;
  instructions: string;
  deadline?: string;
}

/**
 * POST /api/kanban/tasks/delegate — Assign task to sub-agent with context
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body: DelegateBody = await request.json();

    const { taskId, targetAgentId, delegatingAgentId, instructions, deadline } = body;

    if (!taskId || !targetAgentId || !delegatingAgentId || !instructions) {
      return NextResponse.json(
        { error: 'Required: taskId, targetAgentId, delegatingAgentId, instructions' },
        { status: 400 }
      );
    }

    // Verify task exists
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    if (!task) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Update task assignment
    db.prepare(`
      UPDATE tasks SET assigned_agent_id = ?, status = 'assigned',
        due_date = COALESCE(?, due_date), updated_at = ?
      WHERE id = ?
    `).run(targetAgentId, deadline || null, now, taskId);

    // Log delegation event
    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, 'task_delegated', ?, ?, ?, ?)
    `).run(
      uuidv4(), delegatingAgentId, taskId,
      `${delegatingAgentId} delegated to ${targetAgentId}: ${instructions.slice(0, 200)}`,
      now
    );

    // BDI log: intention committed by delegating agent
    const meta = db.prepare('SELECT goal_id FROM kanban_card_meta WHERE task_id = ?')
      .get(taskId) as { goal_id: string } | undefined;

    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details)
      VALUES (?, ?, 'vividwalls', 'intention', 'intention_committed', 'task', ?, ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`, delegatingAgentId,
      taskId, `Delegated task to ${targetAgentId}`,
      JSON.stringify({ instructions, deadline })
    );

    // Create an inter-agent message for the target agent
    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, 'agent_message', ?, ?, ?, ?)
    `).run(
      uuidv4(), targetAgentId, taskId,
      JSON.stringify({
        from: delegatingAgentId,
        to: targetAgentId,
        type: 'task_delegation',
        taskId,
        goalId: meta?.goal_id,
        instructions,
        deadline,
      }),
      now
    );

    // Broadcast
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_updated', payload: updated });

    return NextResponse.json({
      taskId,
      assignedTo: targetAgentId,
      delegatedBy: delegatingAgentId,
      status: 'assigned',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/kanban/tasks/delegate/route.ts
git commit -m "feat: add POST /api/kanban/tasks/delegate — agent task delegation with instructions"
```

---

## Task 5: `POST /api/kanban/tasks/[id]/outcome` — Task Completion + Deliverables

Records task outcome, stores deliverables, triggers rollup.

**Files:**
- Create: `src/app/api/kanban/tasks/[id]/outcome/route.ts`

**Step 1: Create the route file**

```typescript
// src/app/api/kanban/tasks/[id]/outcome/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { v4 as uuidv4 } from 'uuid';

interface OutcomeBody {
  agentId: string;
  status: 'done' | 'review' | 'verification';
  outcome?: string;
  deliverables?: { type: string; title: string; path?: string; description?: string }[];
  notes?: string;
}

/**
 * POST /api/kanban/tasks/:id/outcome — Agent reports task completion
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();
    const body: OutcomeBody = await request.json();

    const { agentId, status, outcome, deliverables, notes } = body;

    if (!agentId || !status) {
      return NextResponse.json(
        { error: 'Required: agentId, status' },
        { status: 400 }
      );
    }

    const validStatuses = ['done', 'review', 'verification'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify task exists
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    if (!task) {
      return NextResponse.json({ error: `Task ${taskId} not found` }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Update task status
    db.prepare(`
      UPDATE tasks SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?
    `).run(status, outcome || notes || null, now, taskId);

    // Store deliverables
    if (deliverables?.length) {
      for (const d of deliverables) {
        db.prepare(`
          INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), taskId, d.type, d.title, d.path || null, d.description || null, now);
      }
    }

    // BDI log
    const meta = db.prepare('SELECT goal_id, initiative_id FROM kanban_card_meta WHERE task_id = ?')
      .get(taskId) as { goal_id: string; initiative_id: string | null } | undefined;

    const transitionType = status === 'done' ? 'goal_achieved' : 'action_executed';
    db.prepare(`
      INSERT INTO bdi_log (id, agent_id, business_id, bdi_state, transition_type, ref_tier, ref_id, summary, details)
      VALUES (?, ?, 'vividwalls', 'action', ?, 'task', ?, ?, ?)
    `).run(
      `bdi-${uuidv4().slice(0, 8)}`, agentId, transitionType,
      taskId, `Task ${status}: ${(task as { title: string }).title}`,
      outcome || notes || null
    );

    // Log event
    db.prepare(`
      INSERT INTO events (id, type, agent_id, task_id, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), `task_${status}`, agentId, taskId, `Agent reported task ${status}`, now);

    // Broadcast
    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    broadcast({ type: 'task_updated', payload: updated });

    // Trigger rollup (non-blocking)
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.MC_URL || 'http://localhost:4000';
    fetch(`${base}/api/kanban/rollup`, { method: 'POST' }).catch(err =>
      console.error('[Outcome] Rollup trigger failed:', err)
    );

    return NextResponse.json({
      taskId,
      status,
      deliverableCount: deliverables?.length || 0,
      goalId: meta?.goal_id,
      initiativeId: meta?.initiative_id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/kanban/tasks/\[id\]/outcome/route.ts
git commit -m "feat: add POST /api/kanban/tasks/:id/outcome — task completion with deliverables + rollup"
```

---

## Task 6: MABOS Plugin — `mc-task-tools.ts` (6 tools)

Creates the 6 agent tools in the MABOS extension that call MC's API endpoints.

**Files:**
- Create: `/Users/kinglerbercy/openclaw-mabos/extensions/mabos/extensions-mabos/src/tools/mc-task-tools.ts`
- Modify: `/Users/kinglerbercy/openclaw-mabos/extensions/mabos/extensions-mabos/index.ts` (register new tools)

**Step 1: Create the tool file**

```typescript
// extensions/mabos/extensions-mabos/src/tools/mc-task-tools.ts
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw-plugin-api";
import type { AnyAgentTool } from "../../../../../src/agents/tools/common.js";

const MC_BASE = process.env.MC_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4000";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

async function mcFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${MC_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `MC API error: ${res.status}`);
  }
  return data;
}

export function createMcTaskTools(_api: OpenClawPluginApi): AnyAgentTool[] {
  return [
    // 1. create_mc_task
    {
      name: "create_mc_task",
      label: "Create MC Task",
      description:
        "Create a task in Mission Control linked to a kanban goal/campaign/initiative. " +
        "The task will appear in the workspace queue and count toward goal progress.",
      parameters: Type.Object({
        title: Type.String({ description: "Task title" }),
        description: Type.Optional(Type.String({ description: "Task description with acceptance criteria" })),
        goalId: Type.String({ description: "Parent goal ID (e.g. G-S001)" }),
        campaignId: Type.Optional(Type.String({ description: "Parent campaign ID if known" })),
        initiativeId: Type.Optional(Type.String({ description: "Parent initiative ID if known" })),
        assignedAgentId: Type.Optional(Type.String({ description: "Agent ID to assign (e.g. vw-lead-gen)" })),
        priority: Type.Optional(Type.Union([
          Type.Literal("low"), Type.Literal("normal"), Type.Literal("high"), Type.Literal("urgent"),
        ], { description: "Task priority, default normal" })),
        estimatedDuration: Type.Optional(Type.String({ description: "Estimated duration (e.g. '2h', '1d')" })),
        domain: Type.Optional(Type.String({ description: "Domain: product, marketing, finance, operations, technology, legal, strategy" })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const agentId = (_api as any).agentId || "system";
        const result = await mcFetch("/api/kanban/tasks/create", {
          method: "POST",
          body: JSON.stringify({
            ...params,
            createdByAgentId: agentId,
          }),
        });
        return textResult(
          `Task created: ${result.taskId}\n` +
          `Status: ${result.status}\n` +
          `Goal: ${result.goalId}\n` +
          (result.initiativeId ? `Initiative: ${result.initiativeId}\n` : "")
        );
      },
    },

    // 2. delegate_task
    {
      name: "delegate_task",
      label: "Delegate Task",
      description:
        "Assign a task to a sub-agent with specific instructions. " +
        "The sub-agent will receive the delegation context in their next cycle.",
      parameters: Type.Object({
        taskId: Type.String({ description: "Task ID to delegate" }),
        targetAgentId: Type.String({ description: "Agent ID to assign to (e.g. vw-outreach)" }),
        instructions: Type.String({ description: "Detailed instructions for the sub-agent" }),
        deadline: Type.Optional(Type.String({ description: "Deadline ISO date (e.g. 2026-03-25)" })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const agentId = (_api as any).agentId || "system";
        const result = await mcFetch("/api/kanban/tasks/delegate", {
          method: "POST",
          body: JSON.stringify({
            ...params,
            delegatingAgentId: agentId,
          }),
        });
        return textResult(
          `Task ${result.taskId} delegated to ${result.assignedTo}\n` +
          `Delegated by: ${result.delegatedBy}\n` +
          `Status: ${result.status}`
        );
      },
    },

    // 3. get_goal_status
    {
      name: "get_goal_status",
      label: "Get Goal Status",
      description:
        "Check the status of a goal, campaign, or initiative including all linked tasks, " +
        "progress percentage, and blockers. Use this to assess task gaps during BDI cycles.",
      parameters: Type.Object({
        id: Type.String({ description: "Goal/campaign/initiative ID" }),
        tier: Type.Optional(Type.Union([
          Type.Literal("goal"), Type.Literal("campaign"), Type.Literal("initiative"),
        ], { description: "Tier type, default 'goal'" })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const tier = (params.tier as string) || "goal";
        const result = await mcFetch(`/api/kanban/goals/${params.id}/status?tier=${tier}`);

        const stats = result.taskStats;
        const entity = result.goal || result.campaign || result.initiative;
        let summary = `${tier.toUpperCase()}: ${entity?.title || params.id}\n`;
        summary += `Stage: ${entity?.stage} | Progress: ${entity?.progress_pct ?? 0}%\n`;
        summary += `Tasks: ${stats.total} total, ${stats.done} done, ${stats.in_progress} in progress, ${stats.blocked} blocked\n`;

        if (stats.total === 0) {
          summary += "\n⚠ NO TASKS EXIST — this goal needs decomposition into tasks.\n";
        }

        if (result.tasks?.length) {
          summary += "\nTask List:\n";
          for (const t of result.tasks) {
            summary += `  - [${t.status}] ${t.title} (assigned: ${t.assigned_agent_id || "unassigned"})\n`;
          }
        }

        if (result.campaigns?.length) {
          summary += `\nCampaigns: ${result.campaigns.length}\n`;
          for (const c of result.campaigns) {
            summary += `  - [${c.stage}] ${c.title} (${c.progress_pct}%)\n`;
          }
        }

        if (result.initiatives?.length) {
          summary += `\nInitiatives: ${result.initiatives.length}\n`;
          for (const i of result.initiatives) {
            summary += `  - [${i.stage}] ${i.title} (${i.progress_pct}%)\n`;
          }
        }

        return textResult(summary);
      },
    },

    // 4. update_task_progress
    {
      name: "update_task_progress",
      label: "Update Task Progress",
      description:
        "Report progress on a task — update status, record outcome and deliverables. " +
        "Triggers rollup so goal progress updates automatically.",
      parameters: Type.Object({
        taskId: Type.String({ description: "Task ID to update" }),
        status: Type.Union([
          Type.Literal("done"), Type.Literal("review"), Type.Literal("verification"),
        ], { description: "New task status" }),
        outcome: Type.Optional(Type.String({ description: "What was accomplished" })),
        deliverables: Type.Optional(Type.Array(Type.Object({
          type: Type.String({ description: "Deliverable type: report, data, code, design, document" }),
          title: Type.String({ description: "Deliverable title" }),
          path: Type.Optional(Type.String({ description: "File path or URL" })),
          description: Type.Optional(Type.String({ description: "Brief description" })),
        }), { description: "List of deliverables produced" })),
        notes: Type.Optional(Type.String({ description: "Additional notes or blockers" })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const agentId = (_api as any).agentId || "system";
        const result = await mcFetch(`/api/kanban/tasks/${params.taskId}/outcome`, {
          method: "POST",
          body: JSON.stringify({ ...params, agentId }),
        });
        return textResult(
          `Task ${result.taskId} → ${result.status}\n` +
          `Deliverables: ${result.deliverableCount}\n` +
          `Goal: ${result.goalId}\n` +
          (result.initiativeId ? `Initiative: ${result.initiativeId}\n` : "") +
          "Rollup triggered — goal progress will update."
        );
      },
    },

    // 5. request_collaboration
    {
      name: "request_collaboration",
      label: "Request Collaboration",
      description:
        "Ask a peer agent for input before planning. Creates a conversation thread " +
        "that the target agent will see in their next BDI cycle.",
      parameters: Type.Object({
        targetAgentId: Type.String({ description: "Agent ID to collaborate with (e.g. vw-cfo)" }),
        goalId: Type.String({ description: "Goal ID this collaboration relates to" }),
        question: Type.String({ description: "The specific question or request" }),
        context: Type.Optional(Type.String({ description: "Background context for the request" })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const agentId = (_api as any).agentId || "system";
        // Store as an inter-agent event in MC
        const result = await mcFetch("/api/events", {
          method: "POST",
          body: JSON.stringify({
            type: "agent_collaboration_request",
            agent_id: params.targetAgentId,
            message: JSON.stringify({
              from: agentId,
              to: params.targetAgentId,
              type: "collaboration_request",
              goalId: params.goalId,
              question: params.question,
              context: params.context,
            }),
          }),
        });
        // Also log BDI
        await mcFetch("/api/kanban/bdi-log", {
          method: "POST",
          body: JSON.stringify({
            agentId,
            bdiState: "desire",
            transitionType: "desire_adopted",
            refTier: "goal",
            refId: params.goalId,
            summary: `Collaboration requested with ${params.targetAgentId}: ${(params.question as string).slice(0, 100)}`,
          }),
        });
        return textResult(
          `Collaboration request sent to ${params.targetAgentId}\n` +
          `Goal: ${params.goalId}\n` +
          `Question: ${params.question}\n` +
          "The target agent will see this in their next BDI cycle."
        );
      },
    },

    // 6. decompose_goal
    {
      name: "decompose_goal",
      label: "Decompose Goal",
      description:
        "Break a goal or initiative into multiple tasks and assign them to agents. " +
        "This is used after research/analysis to create an actionable plan.",
      parameters: Type.Object({
        goalId: Type.String({ description: "Goal ID to decompose under" }),
        campaignId: Type.Optional(Type.String({ description: "Campaign ID if applicable" })),
        initiativeId: Type.Optional(Type.String({ description: "Initiative ID if applicable" })),
        analysis: Type.Optional(Type.String({ description: "Research/analysis that informed this decomposition" })),
        proposedTasks: Type.Array(Type.Object({
          title: Type.String({ description: "Task title" }),
          description: Type.Optional(Type.String({ description: "Task description" })),
          assignedAgentId: Type.Optional(Type.String({ description: "Agent to assign to" })),
          priority: Type.Optional(Type.Union([
            Type.Literal("low"), Type.Literal("normal"), Type.Literal("high"), Type.Literal("urgent"),
          ])),
          estimatedDuration: Type.Optional(Type.String({ description: "e.g. '2h', '1d'" })),
          dependsOnIndex: Type.Optional(Type.Number({ description: "Index of task this depends on (0-based)" })),
        }), { description: "Array of tasks to create" }),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        const agentId = (_api as any).agentId || "system";
        const result = await mcFetch("/api/kanban/tasks/decompose", {
          method: "POST",
          body: JSON.stringify({ ...params, agentId }),
        });
        let summary = `Decomposed into ${result.created} tasks:\n`;
        for (const t of result.tasks) {
          summary += `  ${t.index + 1}. ${t.title} (${t.taskId})\n`;
        }
        summary += `\nGoal: ${result.goalId}`;
        if (result.initiativeId) summary += `\nInitiative: ${result.initiativeId}`;
        summary += "\nRollup triggered — goal progress will update.";
        return textResult(summary);
      },
    },
  ];
}
```

**Step 2: Register tools in MABOS extension index**

In `/Users/kinglerbercy/openclaw-mabos/extensions/mabos/extensions-mabos/index.ts`, add to the factories array:

```typescript
import { createMcTaskTools } from "./src/tools/mc-task-tools.js";

// Add to the factories array:
const factories = [
  // ... existing 24 factories ...
  createMcTaskTools,  // NEW — 6 MC task management tools
];
```

**Step 3: Verify tool file compiles**

```bash
cd /Users/kinglerbercy/openclaw-mabos && npx tsc --noEmit extensions/mabos/extensions-mabos/src/tools/mc-task-tools.ts 2>&1 | head -20
```

**Step 4: Commit**

```bash
cd /Users/kinglerbercy/openclaw-mabos
git add extensions/mabos/extensions-mabos/src/tools/mc-task-tools.ts extensions/mabos/extensions-mabos/index.ts
git commit -m "feat: add 6 MC task management tools — create, delegate, decompose, status, progress, collaboration"
```

---

## Task 7: Integration Test — End-to-End Task Generation Flow

Verify the full pipeline works: goal status → decompose → delegate → outcome → rollup.

**Step 1: Check goal has no tasks**

```bash
curl -s http://localhost:4000/api/kanban/goals/G-S001/status | jq '.taskStats'
# Expected: total should be 0 (or whatever was created in earlier tests)
```

**Step 2: Decompose goal into tasks**

```bash
curl -s -X POST http://localhost:4000/api/kanban/tasks/decompose \
  -H 'Content-Type: application/json' \
  -d '{
    "goalId":"G-S001",
    "agentId":"vw-cmo",
    "analysis":"VividWalls needs to grow online presence through multi-channel marketing",
    "proposedTasks":[
      {"title":"Audit current Shopify store SEO","assignedAgentId":"vw-sales-research","priority":"high","estimatedDuration":"4h"},
      {"title":"Research competitor marketing strategies","assignedAgentId":"vw-sales-research","priority":"high","estimatedDuration":"6h"},
      {"title":"Build email subscriber list from existing customers","assignedAgentId":"vw-lead-gen","priority":"normal","estimatedDuration":"3h","dependsOnIndex":0},
      {"title":"Design social media content calendar","assignedAgentId":"vw-outreach","priority":"normal","estimatedDuration":"4h","dependsOnIndex":1}
    ]
  }' | jq .
```

**Step 3: Verify tasks appear in goal status**

```bash
curl -s http://localhost:4000/api/kanban/goals/G-S001/status | jq '{taskStats, taskCount: (.tasks | length)}'
# Expected: { "taskStats": { "total": 4, ... }, "taskCount": 4 }
```

**Step 4: Complete one task via outcome endpoint**

```bash
# Get a task ID from the decompose response, then:
TASK_ID="<paste-task-id-here>"
curl -s -X POST "http://localhost:4000/api/kanban/tasks/$TASK_ID/outcome" \
  -H 'Content-Type: application/json' \
  -d '{
    "agentId":"vw-sales-research",
    "status":"done",
    "outcome":"Completed SEO audit — found 12 optimization opportunities",
    "deliverables":[{"type":"report","title":"SEO Audit Report","description":"12 items to fix for better ranking"}]
  }' | jq .
```

**Step 5: Verify rollup updated goal progress**

```bash
curl -s http://localhost:4000/api/kanban/goals/G-S001/status | jq '{progress: .goal.progress_pct, taskStats: .taskStats}'
# Expected: progress_pct > 0, taskStats.done = 1
```

**Step 6: Clean up test data (optional)**

```bash
# If you created test tasks and want to remove them before production use:
# sqlite3 /Users/kinglerbercy/mission-control/data/mc.db "DELETE FROM kanban_card_meta WHERE task_id IN (SELECT id FROM tasks WHERE origin='mabos-agent' AND title LIKE 'Test%')"
```

---

## Task 8: Deploy to VPS

Deploy the new MC endpoints to the VPS so MABOS agents (running on VPS) can call them.

**Step 1: Push MC changes**

```bash
cd /Users/kinglerbercy/mission-control && git push origin main
```

**Step 2: Deploy on VPS**

```bash
ssh kingler@100.79.202.93 "cd ~/mission-control && git pull && npm run build && pm2 restart mission-control"
```

**Step 3: Push MABOS changes**

```bash
cd /Users/kinglerbercy/openclaw-mabos && git push origin main
```

**Step 4: Deploy MABOS on VPS**

```bash
ssh kingler@100.79.202.93 "cd ~/openclaw-mabos && git pull && npm run build && pm2 restart openclaw"
```

**Step 5: Verify endpoints on VPS**

```bash
curl -s http://100.79.202.93:4000/api/kanban/goals/G-S001/status | jq '.taskStats'
```

---

## Summary

| Task | Endpoint / Component | Repo | Dependencies |
|------|---------------------|------|-------------|
| 1 | GET /api/kanban/goals/:id/status | MC | None |
| 2 | POST /api/kanban/tasks/create | MC | None |
| 3 | POST /api/kanban/tasks/decompose | MC | Task 2 pattern |
| 4 | POST /api/kanban/tasks/delegate | MC | None |
| 5 | POST /api/kanban/tasks/:id/outcome | MC | None |
| 6 | MABOS mc-task-tools.ts (6 tools) | MABOS | Tasks 1-5 (calls their endpoints) |
| 7 | Integration test | Both | Tasks 1-6 |
| 8 | VPS deployment | Both | Task 7 |

Tasks 1-5 are independent MC endpoints that can be built in parallel. Task 6 depends on all MC endpoints being available. Task 7 is the end-to-end smoke test. Task 8 is deployment.
