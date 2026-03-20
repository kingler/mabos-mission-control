# Agent-Driven Task Generation & Delegation Design

**Date:** 2026-03-18
**Status:** Approved
**Problem:** Goal cards show "0/0 tasks" because `kanban_card_meta` is never populated. No mechanism exists for agents to create, delegate, or execute tasks linked to the kanban hierarchy.

---

## 1. Task Generation & Delegation Architecture

### Core Flow

```
Goal Owner (e.g., CMO)
  → Analyzes goal during BDI cycle
  → Collaborates with peers (CFO for budget, CTO for tech feasibility)
  → Creates a Plan (ordered set of tasks)
  → Delegates tasks to sub-agents (lead-gen, outreach, sales-research)
  → Sub-agents execute autonomously using domain tools
  → Completion rolls up: Tasks → Initiative → Campaign → Goal
```

### Agent Hierarchy for Delegation

```
CEO (Stakeholder liaison)
├── CFO → budget approval, financial analysis
├── CMO → marketing strategy, campaign planning
│   ├── lead-gen → prospect research, lead lists
│   ├── sales-research → market analysis, competitor intel
│   └── outreach → email campaigns, follow-ups
├── COO → operations, fulfillment
├── CTO → technology, platform
├── Legal → compliance, contracts
├── Strategy → planning, competitive analysis
├── Knowledge → research, documentation
└── Ecommerce → store management, product listings
```

A plan is not a single task — it's a goal decomposition. The CMO sees "Run Weekly Ad Campaigns" (G-O005) → collaborates with CFO on budget → produces a plan with 5 tasks → delegates each task to the right sub-agent. Each task links back to the initiative via `kanban_card_meta`.

### Triggers

- **Proactive (BDI Cycle):** During scheduled BDI cycles, agents assess assigned goals for task gaps and generate tasks automatically.
- **Reactive (On-Demand):** Agents can be triggered via API to assess and generate tasks for specific goals.

---

## 2. New MABOS Agent Tools (6 tools)

### 2.1 `create_mc_task`
Agent creates a task linked to the kanban hierarchy.

**Inputs:** `title`, `description`, `goalId`, `campaignId?`, `initiativeId?`, `assignedAgentId`, `priority`, `estimatedDuration`, `domain`
**Result:** Task created in MC + `kanban_card_meta` populated + BDI log entry

### 2.2 `delegate_task`
Agent assigns a task to a sub-agent with context.

**Inputs:** `taskId`, `targetAgentId`, `instructions`, `deadline?`
**Result:** Task assigned, sub-agent notified via message, status → assigned

### 2.3 `get_goal_status`
Query tasks/progress for any goal in the hierarchy.

**Inputs:** `goalId` | `campaignId` | `initiativeId`
**Result:** Task list with statuses, `progress_pct`, blockers, agent assignments

### 2.4 `update_task_progress`
Agent reports work done on a task.

**Inputs:** `taskId`, `status`, `outcome?`, `deliverables?`, `notes?`
**Result:** Task updated, deliverable recorded, rollup triggered

### 2.5 `request_collaboration`
Agent asks a peer for input before planning.

**Inputs:** `targetAgentId`, `goalId`, `question`, `context`
**Result:** Creates a conversation thread, peer agent responds in next BDI cycle

### 2.6 `decompose_goal`
Agent breaks a goal/initiative into a plan of tasks.

**Inputs:** `initiativeId`, `analysis` (research findings), `proposedTasks[]`
**Result:** Multiple tasks created, linked to initiative, assigned to sub-agents

---

## 3. MC API Endpoints (5 endpoints)

### `POST /api/kanban/tasks/create`
Creates task + links to hierarchy.
- Validates goal/campaign/initiative exist
- Inserts into `tasks` table with `origin='mabos-agent'`
- Inserts into `kanban_card_meta` (the missing link)
- Records `stage_transition` and `bdi_log` entries
- Triggers SSE broadcast so UI updates live

### `POST /api/kanban/tasks/delegate`
Assigns task to sub-agent.
- Updates `assigned_agent_id`
- Creates conversation thread with instructions
- Fires auto-dispatch to the agent's OpenClaw session

### `POST /api/kanban/tasks/decompose`
Bulk task creation from a plan.
- Accepts array of proposed tasks
- Creates all tasks + `kanban_card_meta` links in a transaction
- Sets `depends_on` for sequential tasks
- Returns created task IDs for the agent to track

### `GET /api/kanban/goals/:id/status`
Goal health check for agents.
- Returns tasks, progress, blockers, agent assignments
- Agents call this during BDI cycle to assess gaps

### `POST /api/kanban/tasks/:id/outcome`
Record completion + deliverables.
- Updates task status to done
- Stores deliverables in `task_deliverables`
- Triggers rollup: initiative → campaign → goal `progress_pct`

---

## 4. BDI Cycle Integration

During each agent's scheduled BDI cycle, a new task assessment phase runs after intention commit:

```
BDI Cycle (existing)
  1. Belief Revision    → scan environment, update beliefs
  2. Desire Generation  → evaluate goals, adopt desires
  3. Intention Commit   → select plans, commit intentions
  ──────── NEW ────────
  4. Task Assessment    → check assigned goals for task gaps
  5. Collaboration      → request peer input if needed
  6. Plan Decomposition → break initiatives into tasks
  7. Delegation         → assign tasks to sub-agents
  8. Execution          → sub-agents run tasks with domain tools
  9. Outcome Reporting  → update task status, record deliverables
```

### Task Assessment Logic (Step 4)

For each initiative assigned to this agent:
- Call `get_goal_status(initiativeId)`
- If 0 tasks exist → trigger `decompose_goal`
- If all tasks done → check if goal met, create next-phase tasks
- If tasks blocked → escalate or `request_collaboration`
- If tasks in_progress → skip (sub-agents executing)

### Example Flow — CMO processes "Run Weekly Ad Campaigns" (G-O005)

1. CMO BDI cycle fires (cron: every 4 hours)
2. Belief revision: pulls Shopify ad spend data, Meta ROAS metrics
3. Sees G-O005 has 0 tasks → calls `request_collaboration(CFO, "weekly ad budget?")`
4. Next cycle: CFO responded with $2,400/week budget
5. CMO calls `decompose_goal(G-O005)` → creates 4 tasks:
   - "Research top-performing ad creatives" → assigned to sales-research
   - "Build target audience segments" → assigned to lead-gen
   - "Launch Meta/Google campaigns" → assigned to outreach
   - "Analyze weekly ROAS and optimize" → assigned to sales-research
6. Sub-agents execute autonomously using existing tools
7. Each sub-agent calls `update_task_progress` on completion
8. Rollup: G-O005 progress goes from 0% → 25% → 50% → 100%

---

## 5. MABOS-Side Tool Implementation

### File: `src/agents/tools/mc-task-tools.ts` (NEW)

Tools register in the OpenClaw agent tool registry and call MC's API endpoints. The agent's LLM decides when to use each tool based on BDI state.

```typescript
// Tool registration pattern (existing convention)
create_mc_task: {
  description: "Create a task in Mission Control linked to a kanban goal/initiative",
  parameters: { title, description, goalId, campaignId, initiativeId,
                assignedAgentId, priority, estimatedDuration, domain },
  execute: async (params, context) => {
    // POST to MC /api/kanban/tasks/create
    // Returns { taskId, status }
  }
}

delegate_task: {
  description: "Assign a task to a sub-agent with instructions",
  parameters: { taskId, targetAgentId, instructions, deadline },
  execute: async (params, context) => {
    // POST to MC /api/kanban/tasks/delegate
    // Creates conversation thread for context handoff
  }
}

decompose_goal: {
  description: "Break an initiative into multiple tasks and assign to agents",
  parameters: { initiativeId, analysis, proposedTasks[] },
  execute: async (params, context) => {
    // POST to MC /api/kanban/tasks/decompose
  }
}

// get_goal_status, update_task_progress, request_collaboration follow same pattern
```

### Agent Awareness

Each agent's system prompt gets updated to include:
- Its assigned goals/initiatives (from kanban hierarchy)
- Its sub-agents and their capabilities
- Instructions to check goal status during BDI cycles and generate tasks when gaps exist

---

## 6. Files Summary

| File | Repo | Action |
|------|------|--------|
| `src/app/api/kanban/tasks/create/route.ts` | mission-control | NEW |
| `src/app/api/kanban/tasks/delegate/route.ts` | mission-control | NEW |
| `src/app/api/kanban/tasks/decompose/route.ts` | mission-control | NEW |
| `src/app/api/kanban/goals/[id]/status/route.ts` | mission-control | NEW |
| `src/app/api/kanban/tasks/[id]/outcome/route.ts` | mission-control | NEW |
| `src/agents/tools/mc-task-tools.ts` | openclaw-mabos | NEW |
| Agent system prompts | openclaw-mabos | MODIFY |
| BDI cycle handler | openclaw-mabos | MODIFY |

## 7. Verification

1. CMO BDI cycle fires → detects G-O005 has 0 tasks
2. CMO calls `request_collaboration(CFO, "budget?")` → thread created
3. CFO responds in next cycle → CMO gets budget data
4. CMO calls `decompose_goal(G-O005, [...tasks])` → 4 tasks created
5. `kanban_card_meta` now has 4 rows linking tasks to G-O005
6. GoalBoard shows "4/0 tasks" (4 total, 0 done) with 0% progress
7. Sub-agents execute tasks → `update_task_progress` → status changes
8. Rollup triggers → G-O005 progress climbs to 100%
9. GoalBoard updates live via SSE
