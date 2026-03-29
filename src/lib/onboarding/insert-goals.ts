/**
 * Insert pipeline output into kanban tables
 *
 * Maps decomposition outputs:
 *   Stage 1 goals → kanban_goals (Tier 1)
 *   Stage 3 projects → kanban_campaigns (Tier 2)
 *   Stage 5 tasks → tasks + kanban_card_meta (Tier 4)
 */

import Database from 'better-sqlite3';
import { resolveTaskAgent } from '@/lib/kanban/templates';
import type { KanbanDomain } from '@/lib/types/kanban';

const VALID_DOMAINS: KanbanDomain[] = ['product', 'marketing', 'finance', 'operations', 'technology', 'legal', 'hr', 'strategy'];

function toDomain(cat: string): KanbanDomain {
  const map: Record<string, KanbanDomain> = {
    'RG': 'finance', 'FP': 'finance',
    'OP': 'operations',
    'MK': 'marketing',
    'PE': 'technology',
    'CX': 'operations',
    'PC': 'hr',
    'CL': 'legal',
  };
  const prefix = (cat || '').slice(0, 2).toUpperCase();
  return map[prefix] || 'strategy';
}

function toPriority(p: string): number {
  const map: Record<string, number> = { critical: 1, high: 3, medium: 5, low: 8 };
  return map[(p || '').toLowerCase()] || 5;
}

export function insertGoalsFromPipeline(
  db: Database.Database,
  workspaceId: string,
  businessId: string,
  pipelineOutput: {
    stage1?: Record<string, unknown>;
    stage3?: Record<string, unknown>;
    stage5?: Record<string, unknown>;
  }
): { goalCount: number; campaignCount: number; taskCount: number } {
  let goalCount = 0;
  let campaignCount = 0;
  let taskCount = 0;

  const insertAll = db.transaction(() => {
    // ─── Stage 1 → kanban_goals ───────────────────────────────
    const goalCategories = (pipelineOutput.stage1 as any)?.goal_categories || [];
    const goalIdMap = new Map<string, string>(); // original goal_id → db id

    const insertGoal = db.prepare(`
      INSERT INTO kanban_goals (id, business_id, title, description, meta_type, domain, stage, priority, kpi_definition, tags)
      VALUES (?, ?, ?, ?, 'strategic', ?, 'backlog', ?, ?, ?)
    `);

    for (const cat of goalCategories) {
      const goals = cat.goals || [];
      for (const g of goals) {
        const id = `onb-${g.goal_id || crypto.randomUUID().slice(0, 8)}`;
        const domain = toDomain(g.goal_id || cat.category_id);
        insertGoal.run(
          id, businessId,
          g.goal_statement || g.goal_id,
          `${g.strategic_alignment || ''}\n${g.estimated_impact || ''}`.trim() || null,
          VALID_DOMAINS.includes(domain) ? domain : 'strategy',
          toPriority(g.priority),
          g.kpi_metric ? JSON.stringify({ metric: g.kpi_metric, target: g.kpi_target }) : null,
          JSON.stringify([g.goal_type || 'achieve']),
        );
        goalIdMap.set(g.goal_id, id);
        goalCount++;
      }
    }

    // ─── Stage 3 → kanban_campaigns ───────────────────────────
    const projects = (pipelineOutput.stage3 as any)?.projects || [];
    const projectIdMap = new Map<string, string>();

    const insertCampaign = db.prepare(`
      INSERT INTO kanban_campaigns (id, goal_id, business_id, title, description, meta_type, domain, stage, priority, tags)
      VALUES (?, ?, ?, ?, ?, 'tactical', ?, 'backlog', ?, ?)
    `);

    for (const proj of projects) {
      const id = `onb-${proj.project_id || crypto.randomUUID().slice(0, 8)}`;
      // Link to first addressed goal
      const firstGoalRef = (proj.goals_addressed || [])[0];
      const parentGoalId = goalIdMap.get(firstGoalRef) || (goalIdMap.values().next().value) || null;

      if (!parentGoalId) continue;

      const domain = toDomain(proj.category_primary || '');
      insertCampaign.run(
        id, parentGoalId, businessId,
        proj.project_name || proj.project_id,
        proj.description || null,
        VALID_DOMAINS.includes(domain) ? domain : 'strategy',
        toPriority(proj.priority),
        JSON.stringify([proj.project_type || 'initiative']),
      );
      projectIdMap.set(proj.project_id, id);
      campaignCount++;
    }

    // ─── Stage 5 → tasks + kanban_card_meta ───────────────────
    const planTasks = (pipelineOutput.stage5 as any)?.plan_tasks || [];

    const insertTask = db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, workspace_id, business_id, origin, estimated_duration)
      VALUES (?, ?, ?, 'inbox', ?, ?, ?, 'onboarding', ?)
    `);

    const insertMeta = db.prepare(`
      INSERT INTO kanban_card_meta (task_id, goal_id, domain, meta_type)
      VALUES (?, ?, ?, 'operational')
    `);

    for (const pt of planTasks) {
      const tasks = pt.tasks || [];
      for (const t of tasks) {
        const taskId = `onb-${t.task_id || crypto.randomUUID().slice(0, 8)}`;
        const title = t.task_name || t.task_id;
        const domain = toDomain('') as KanbanDomain;
        const agentId = resolveTaskAgent(title, domain);
        const priority = t.estimated_duration_minutes > 120 ? 'high' : 'normal';
        const duration = t.estimated_duration_minutes ? `${t.estimated_duration_minutes}m` : null;

        insertTask.run(
          taskId, title, t.description || null,
          priority, workspaceId, businessId, duration,
        );

        // Link to first goal available
        const firstGoalId = goalIdMap.values().next().value;
        if (firstGoalId) {
          insertMeta.run(taskId, firstGoalId, VALID_DOMAINS.includes(domain) ? domain : 'strategy');
        }

        taskCount++;
      }
    }
  });

  insertAll();
  return { goalCount, campaignCount, taskCount };
}
