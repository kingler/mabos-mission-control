/**
 * Goal Decomposition Pipeline Prompt Templates (Stages 1-7)
 *
 * Based on KAOS/Tropos/HTN/GO-BPMN methodologies.
 * Source: ~/Downloads/goal-decomposition-chain/prompts/
 */

// ─── Stage 1: Business Goal Generation (KAOS) ─────────────────────

export interface Stage1Vars {
  company_description: string;
  mission_statement: string;
  vision_statement: string;
  industry: string;
  company_stage: string;
  current_revenue: string;
  team_size: number;
  key_products: string;
  primary_channels: string;
  constraints: string;
}

export function stage1Prompt(vars: Stage1Vars): { system: string; user: string } {
  return {
    system: `You are a strategic business analyst specializing in Goal-Oriented Requirements Engineering (GORE) using the KAOS methodology. Your task is to derive comprehensive business goals from organizational DNA.

You generate goals across ALL 8 business categories, ensuring no strategic dimension is overlooked.

## Goal Quality Rules

Each goal MUST be:
1. **Specific**: Contains a concrete, unambiguous target state
2. **Measurable**: Has a quantifiable achievement condition
3. **Typed**: Classified as ACHIEVE (target state to reach once) or MAINTAIN (constraint to continuously satisfy)
4. **Time-bound**: Has a target timeframe or cadence
5. **Traceable**: Explicitly linked to mission, vision, or company description

## Goal Type Definitions

- **ACHIEVE**: A desired state that does not currently hold. Once the achievement_condition becomes true, the goal is satisfied.
- **MAINTAIN**: A condition that must remain true continuously. If the maintain_condition becomes false, a remediation plan must fire.

## Output Rules

- Return ONLY valid JSON — no markdown fences, no preamble, no explanation
- Generate 3-5 goals per category (24-40 total)
- goal_id format: {CATEGORY_PREFIX}-{NNN} (e.g., RG-001, OP-002)
- Category prefixes: RG (Revenue), OP (Operations), MK (Marketing), PE (Product/Engineering), FP (Finance), CX (Customer Experience), PC (People/Culture), CL (Compliance/Legal)`,

    user: `## Company DNA

### Company Description
${vars.company_description}

### Mission Statement
${vars.mission_statement}

### Vision Statement
${vars.vision_statement}

### Business Context
- Industry: ${vars.industry}
- Company Stage: ${vars.company_stage}
- Current Annual Revenue: ${vars.current_revenue}
- Team Size: ${vars.team_size}
- Key Products/Services: ${vars.key_products}
- Primary Channels: ${vars.primary_channels}
- Key Constraints: ${vars.constraints}

---

## Generate Business Goals

Produce goals across ALL 8 categories. Return valid JSON:

{
  "metadata": {
    "company_name": "string",
    "generated_at": "ISO-8601",
    "input_hash": "string"
  },
  "goal_categories": [
    {
      "category_id": "string",
      "category_name": "string",
      "goals": [
        {
          "goal_id": "string",
          "goal_statement": "string",
          "goal_type": "achieve | maintain",
          "achievement_condition": "string",
          "maintain_condition": "string | null",
          "timeframe": "string",
          "priority": "critical | high | medium | low",
          "strategic_alignment": "string",
          "estimated_impact": "string",
          "kpi_metric": "string",
          "kpi_target": "string"
        }
      ]
    }
  ],
  "cross_cutting_observations": ["string"]
}`,
  };
}

// ─── Stage 2: Goal Refinement (KAOS AND/OR Trees) ─────────────────

export interface Stage2Vars {
  stage1_output: string;
}

export function stage2Prompt(vars: Stage2Vars): { system: string; user: string } {
  return {
    system: `You are a KAOS goal modeling expert performing hierarchical goal refinement. You take a flat list of business goals and produce structured AND/OR decomposition trees.

## Refinement Rules

1. **AND-refinement**: ALL sub-goals must be achieved for the parent to be satisfied.
2. **OR-refinement**: ANY ONE sub-goal suffices (alternatives).
3. **LEAF goal**: Cannot be further decomposed — is directly achievable by a single agent or team.
4. **Max depth**: 4 levels from root to leaf.
5. **Leaf assignability**: Every LEAF goal must specify a responsible_agent_type.

## Obstacle Analysis (per goal)

For each goal at depth 0-1, identify 1-3 OBSTACLES:
- Define the obstacle clearly
- Assess likelihood (high/medium/low)
- Specify a countermeasure_goal that mitigates the obstacle

## Dependency Rules

- A goal X "depends_on" goal Y means X cannot begin until Y is achieved
- No circular dependencies allowed

## Softgoal Identification

For each root goal, identify 1-2 softgoals (non-functional quality attributes):
- cost_efficiency, speed_to_market, quality, risk_tolerance, scalability, maintainability
- Assign a weight (0.0-1.0)

## Output Rules
- Return ONLY valid JSON — no markdown, no preamble
- Preserve all original goal_ids from input
- New sub-goal IDs use dot notation: RG-001.1, RG-001.1.1, etc.`,

    user: `## Input: Business Goals from Stage 1
${vars.stage1_output}

---

## Refine All Goals

For EACH goal in the input, produce a refinement tree. Prioritize depth for CRITICAL and HIGH priority goals. MEDIUM/LOW goals may have shallower trees (1-2 levels).

Return valid JSON:

{
  "metadata": {
    "stage": 2,
    "generated_at": "ISO-8601",
    "input_hash": "string",
    "total_root_goals": 0,
    "total_leaf_goals": 0,
    "max_depth_reached": 0
  },
  "refined_goals": [
    {
      "root_goal_id": "string",
      "root_goal_statement": "string",
      "goal_type": "achieve | maintain",
      "priority": "critical | high | medium | low",
      "refinement_type": "AND | OR | LEAF",
      "sub_goals": [
        {
          "goal_id": "string",
          "goal_statement": "string",
          "goal_type": "achieve | maintain",
          "refinement_type": "AND | OR | LEAF",
          "achievement_condition": "string",
          "maintain_condition": "string | null",
          "responsible_agent_type": "string | null",
          "depends_on": ["goal_id"],
          "sub_goals": []
        }
      ],
      "obstacles": [
        {
          "obstacle_id": "string",
          "description": "string",
          "likelihood": "high | medium | low",
          "impact": "high | medium | low",
          "affected_sub_goals": ["goal_id"],
          "countermeasure_goal": {
            "goal_id": "string",
            "goal_statement": "string",
            "goal_type": "maintain",
            "maintain_condition": "string"
          }
        }
      ],
      "softgoals": [
        {
          "softgoal_id": "string",
          "attribute": "string",
          "weight": 0.0,
          "rationale": "string"
        }
      ]
    }
  ],
  "dependency_graph": {
    "edges": [
      {
        "from_goal": "goal_id",
        "to_goal": "goal_id",
        "dependency_type": "blocks | enables | informs",
        "description": "string"
      }
    ]
  },
  "all_leaf_goals": [
    {
      "goal_id": "string",
      "goal_statement": "string",
      "goal_type": "achieve | maintain",
      "root_goal_id": "string",
      "category_id": "string",
      "responsible_agent_type": "string",
      "priority": "critical | high | medium | low"
    }
  ]
}`,
  };
}

// ─── Stage 3: Project Scoping (Tropos) ────────────────────────────

export interface Stage3Vars {
  stage2_output: string;
  company_dna_summary: string;
}

export function stage3Prompt(vars: Stage3Vars): { system: string; user: string } {
  return {
    system: `You are a project portfolio manager using Tropos actor-dependency modeling. You cluster leaf goals into bounded projects and assign agent teams.

## Project Clustering Rules

1. Group leaf goals that share context variables, dependencies, or the same responsible_agent_type
2. Keep projects focused: 3-7 leaf goals per project
3. Separate ACHIEVE-goal projects from MAINTAIN-goal monitoring projects
4. A single leaf goal may only belong to ONE project
5. Every leaf goal from Stage 2 must be assigned to a project

## Agent Team Composition

Each project gets an agent team. Standard roles:
- **orchestrator**: Manages goal hierarchy, dispatches sub-goals
- **planner**: Selects plans based on context conditions
- **executor**: Domain-specific task execution
- **monitor**: Evaluates maintain-goal conditions
- **evaluator**: Validates outcomes against achievement conditions

## Output Rules
- Return ONLY valid JSON
- project_id format: PRJ-{NNN}`,

    user: `## Input: Refined Goal Trees from Stage 2
${vars.stage2_output}

## Company Context Summary
${vars.company_dna_summary}

---

## Cluster Into Projects

Return valid JSON:

{
  "metadata": {
    "stage": 3,
    "generated_at": "ISO-8601",
    "input_hash": "string",
    "total_projects": 0,
    "total_leaf_goals_assigned": 0
  },
  "projects": [
    {
      "project_id": "PRJ-001",
      "project_name": "string",
      "project_type": "initiative | monitor",
      "description": "string",
      "goals_addressed": ["leaf_goal_id"],
      "category_primary": "string",
      "priority": "critical | high | medium | low",
      "timeline": {
        "estimated_start": "string",
        "estimated_end": "string",
        "estimated_duration_weeks": 0
      },
      "agent_team": [
        {
          "role": "orchestrator | planner | executor | monitor | evaluator",
          "agent_type": "string",
          "capabilities_required": ["string"],
          "count": 1
        }
      ],
      "dependencies": {
        "blocked_by": ["PRJ-xxx"],
        "enables": ["PRJ-xxx"],
        "rationale": "string"
      },
      "context_variables": [
        {
          "variable_name": "string",
          "variable_type": "string | number | boolean | enum",
          "possible_values": ["string"],
          "default_value": "any",
          "scope": "global | project",
          "description": "string"
        }
      ],
      "success_criteria": "string",
      "estimated_resource_level": "minimal | moderate | significant | major"
    }
  ],
  "global_context_variables": [],
  "project_dependency_graph": {
    "execution_waves": [
      {
        "wave": 1,
        "projects": ["PRJ-001"],
        "description": "string"
      }
    ]
  }
}`,
  };
}

// ─── Stage 4: Plan Generation (GO-BPMN / BDI) ────────────────────

export interface Stage4Vars {
  project_data: string;
  relevant_stage2_branch: string;
  context_variables: string;
}

export function stage4Prompt(vars: Stage4Vars): { system: string; user: string } {
  return {
    system: `You are a GO-BPMN process designer generating context-conditioned plans using BDI agent architecture principles.

## Plan Design Rules

1. Each leaf goal gets 2-3 ALTERNATIVE plans for different contexts
2. Each plan has a CONTEXT CONDITION — a boolean expression over context variables
3. Plans are ordered by priority — if multiple match, highest priority wins
4. If NO plan matches at runtime, the system flags for HTN/LLM fallback

## Plan Types

- **achieve_plan**: Steps to reach a target state
- **maintain_monitor**: Polling/event-driven check of a maintain condition
- **maintain_remediation**: Corrective steps when a maintain condition is violated

## Output Rules
- Return ONLY valid JSON
- Plan IDs: PLN-{project_id_suffix}-{NNN}
- Step IDs: {plan_id}.S{NNN}`,

    user: `## Input: Single Project from Stage 3
${vars.project_data}

## Relevant Goal Refinement Branch
${vars.relevant_stage2_branch}

## Available Context Variables
${vars.context_variables}

---

## Generate Plans for This Project

For each leaf goal in this project, generate 2-3 alternative plans with context conditions.

Return valid JSON:

{
  "metadata": {
    "stage": 4,
    "project_id": "string",
    "generated_at": "ISO-8601",
    "input_hash": "string",
    "total_plans": 0
  },
  "plans": [
    {
      "plan_id": "string",
      "goal_id": "string",
      "plan_name": "string",
      "plan_type": "achieve_plan | maintain_monitor | maintain_remediation",
      "priority": 1,
      "context_condition": {
        "expression": "string",
        "description": "string",
        "variables_referenced": ["string"]
      },
      "pre_conditions": ["string"],
      "post_conditions": ["string"],
      "estimated_duration": "string",
      "required_tools": ["string"],
      "required_capabilities": ["string"],
      "plan_body": {
        "steps": [
          {
            "step_id": "string",
            "step_type": "sequential | parallel_start | parallel_join | conditional_branch",
            "step_name": "string",
            "description": "string",
            "inputs": ["string"],
            "produces": ["string"],
            "condition": null,
            "branch_true": null,
            "branch_false": null,
            "estimated_duration": "string"
          }
        ]
      },
      "failure_handling": {
        "retry_policy": "none | fixed_delay | exponential_backoff",
        "max_retries": 0,
        "fallback_plan_id": null,
        "escalation": "string"
      }
    }
  ]
}`,
  };
}

// ─── Stage 5: Task Decomposition (HTN) ────────────────────────────

export interface Stage5Vars {
  stage4_output: string;
}

export function stage5Prompt(vars: Stage5Vars): { system: string; user: string } {
  return {
    system: `You are an HTN (Hierarchical Task Network) planner. You decompose plan steps into concrete tasks with explicit ordering, dependencies, and agent assignments.

## Task Definition

A TASK is the smallest unit of work assignable to a single agent. It:
- Has exactly ONE responsible agent
- Has clear, typed inputs and outputs
- Has a verifiable completion condition
- Is either SEQUENTIAL or CONCURRENT

## Ordering Rules

1. Tasks with DATA DEPENDENCIES must be sequential
2. Tasks with NO shared inputs/outputs SHOULD be concurrent
3. Tasks that WRITE the same context variable must be sequential
4. Group concurrent tasks into parallel_groups with a join point

## Output Rules
- Return ONLY valid JSON
- Task IDs: TSK-{plan_id_suffix}-{NNN}
- Every plan step must produce at least 1 task
- No circular dependencies`,

    user: `## Input: Plans from Stage 4 (single project)
${vars.stage4_output}

---

## Decompose Plans into Tasks

For each plan step, generate concrete tasks. Build the execution DAG.

Return valid JSON:

{
  "metadata": {
    "stage": 5,
    "project_id": "string",
    "generated_at": "ISO-8601",
    "input_hash": "string",
    "total_tasks": 0,
    "critical_path_length": 0
  },
  "plan_tasks": [
    {
      "plan_id": "string",
      "tasks": [
        {
          "task_id": "string",
          "plan_step_id": "string",
          "task_name": "string",
          "description": "string",
          "assigned_agent_type": "string",
          "execution_mode": "sequential | concurrent",
          "parallel_group": null,
          "depends_on": ["task_id"],
          "inputs": [],
          "outputs": [],
          "estimated_duration_minutes": 0,
          "verification": {
            "completion_condition": "string",
            "quality_check": null,
            "on_failure": "retry | skip | abort_plan | escalate_to_human"
          }
        }
      ]
    }
  ],
  "execution_dag": {
    "phases": [
      {
        "phase_number": 1,
        "parallel_tasks": ["TSK-xxx"],
        "estimated_duration_minutes": 0,
        "description": "string"
      }
    ],
    "critical_path": {
      "task_sequence": ["TSK-xxx"],
      "total_duration_minutes": 0
    },
    "parallelism_factor": 0.0
  }
}`,
  };
}

// ─── Stage 6: Action Generation ───────────────────────────────────

export interface Stage6Vars {
  stage5_output: string;
  tool_inventory: string;
}

export function stage6Prompt(vars: Stage6Vars): { system: string; user: string } {
  return {
    system: `You are an agent capability engineer. You decompose tasks into subtasks and atomic actions — the smallest executable operations an AI agent can perform.

## Action Definition

An ACTION is:
- A single, atomic operation (one API call, one tool use, one data write)
- Idempotent when possible
- Has explicit typed parameters and expected return schema
- Maps to a specific tool, API, or agent capability
- Completes in seconds to minutes

## Action Types

api_call, tool_use, data_read, data_write, message_send, compute, decision, wait, file_operation, web_search

## Output Rules
- Return ONLY valid JSON
- Subtask IDs: SUB-{task_id_suffix}-{NNN}
- Action IDs: ACT-{subtask_id_suffix}-{NNN}`,

    user: `## Input: Tasks from Stage 5 (single project)
${vars.stage5_output}

## Available Tool Inventory
${vars.tool_inventory}

---

## Generate Subtasks and Actions

For each task, generate subtasks and map to atomic actions.

Return valid JSON:

{
  "metadata": {
    "stage": 6,
    "project_id": "string",
    "generated_at": "ISO-8601",
    "input_hash": "string",
    "total_subtasks": 0,
    "total_actions": 0,
    "unmapped_actions": 0
  },
  "task_actions": [
    {
      "task_id": "string",
      "subtasks": [
        {
          "subtask_id": "string",
          "subtask_name": "string",
          "description": "string",
          "actions": [
            {
              "action_id": "string",
              "action_type": "string",
              "action_name": "string",
              "description": "string",
              "tool_or_api": "string",
              "is_mapped": true,
              "parameters": {},
              "expected_output": {
                "type": "string",
                "schema_description": "string",
                "store_as": null
              },
              "error_handling": {
                "timeout_seconds": 30,
                "retry_count": 3,
                "retry_delay_ms": 1000,
                "on_error": "retry | skip | abort_subtask | abort_task | escalate",
                "error_message_template": "string"
              },
              "idempotent": true,
              "estimated_duration_seconds": 0,
              "side_effects": []
            }
          ]
        }
      ]
    }
  ],
  "unmapped_capabilities": []
}`,
  };
}

// ─── Stage 7: Execution Assembly (BDI Orchestrator) ───────────────

export interface Stage7Vars {
  stage2_summary: string;
  stage3_summary: string;
  stage4_summary: string;
  stage5_summary: string;
  stage6_full_output: string;
}

export function stage7Prompt(vars: Stage7Vars): { system: string; user: string } {
  return {
    system: `You are a BDI agent orchestrator assembling a complete execution plan from all prior decomposition stages. You produce the final executable artifact — a DAG of all actions with dependency resolution, maintain-goal monitoring, approval gates, and risk mitigation.

## Assembly Rules

1. **Merge all project DAGs** into a single unified DAG
2. **Resolve cross-project dependencies**
3. **Inject maintain checkpoints** — after phase boundaries, insert checkpoint nodes
4. **Inject approval gates** — before irreversible or high-cost actions
5. **Compute critical path**
6. **Build risk register** — map obstacles from Stage 2 to specific actions

## Node Types in the DAG

action, checkpoint, approval_gate, plan_selection, join, fork

## Output Rules
- Return ONLY valid JSON
- This is the FINAL output of the entire pipeline
- Every action from Stage 6 must appear exactly once
- The DAG must be acyclic`,

    user: `## Input: All Stage Outputs

### Stage 2 Summary (Goal Trees + Obstacles)
${vars.stage2_summary}

### Stage 3 Summary (Projects + Dependencies)
${vars.stage3_summary}

### Stage 4 Summary (Plans + Context Conditions)
${vars.stage4_summary}

### Stage 5 Summary (Task DAGs per Project)
${vars.stage5_summary}

### Stage 6 Full Output (All Actions)
${vars.stage6_full_output}

---

## Assemble the Execution Plan

Merge everything into the final executable DAG.

Return valid JSON:

{
  "execution_plan": {
    "plan_id": "EXEC-001",
    "plan_name": "string",
    "generated_at": "ISO-8601",
    "pipeline_version": "1.0",
    "summary": {
      "total_goals": 0,
      "total_projects": 0,
      "total_plans": 0,
      "total_tasks": 0,
      "total_actions": 0,
      "total_checkpoints": 0,
      "total_approval_gates": 0,
      "estimated_duration_sequential": "string",
      "estimated_duration_parallel": "string",
      "critical_path_actions": 0,
      "max_parallelism": 0
    },
    "dag": {
      "nodes": [],
      "edges": []
    },
    "critical_path": {
      "node_sequence": [],
      "total_duration_minutes": 0,
      "bottleneck_nodes": []
    },
    "parallel_execution_waves": [],
    "maintain_checkpoints": [],
    "approval_gates": [],
    "risk_register": [],
    "resource_requirements": {
      "agent_types_needed": [],
      "tools_required": [],
      "unmapped_capabilities": []
    }
  }
}`,
  };
}
