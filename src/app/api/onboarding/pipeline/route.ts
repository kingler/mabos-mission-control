import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { extractJSON } from '@/lib/planning-utils';
import { insertGoalsFromPipeline } from '@/lib/onboarding/insert-goals';
import {
  stage1Prompt, stage2Prompt, stage3Prompt,
  stage4Prompt, stage5Prompt, stage6Prompt, stage7Prompt,
} from '@/lib/onboarding/prompts';
import { v4 as uuidv4 } from 'uuid';

const STAGE_NAMES = [
  'business_goal_generation',
  'goal_refinement',
  'project_scoping',
  'plan_generation',
  'task_decomposition',
  'subtask_action_generation',
  'execution_plan_assembly',
] as const;

const STAGE_DISPLAY_NAMES = [
  'Goal Generation',
  'Goal Refinement',
  'Project Scoping',
  'Plan Generation',
  'Task Decomposition',
  'Action Generation',
  'Execution Assembly',
];

async function callLLM(system: string, user: string, maxTokens = 8192): Promise<string> {
  const baseUrl = process.env.MABOS_API_URL || 'http://127.0.0.1:18789';
  const authToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${baseUrl}/mabos/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(180_000), // 3 min per stage
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`LLM call failed: ${res.status} ${errBody}`);
  }

  const data = await res.json();
  return data.content || data.response || data.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, profileId } = await request.json();

    if (!workspaceId || !profileId) {
      return NextResponse.json({ error: 'Required: workspaceId, profileId' }, { status: 400 });
    }

    const db = getDb();

    // Load business profile
    const profile = db.prepare('SELECT * FROM business_profiles WHERE id = ?').get(profileId) as Record<string, unknown> | undefined;
    if (!profile) {
      return NextResponse.json({ error: `Profile ${profileId} not found` }, { status: 404 });
    }

    // Create pipeline run
    const pipelineRunId = `run-${uuidv4().slice(0, 12)}`;

    // Create a temporary goal row for the pipeline (required by decomposition_stages FK)
    const tempGoalId = `onb-goal-${uuidv4().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO kanban_goals (id, business_id, title, description, meta_type, domain, stage, priority)
      VALUES (?, ?, ?, ?, 'strategic', 'strategy', 'in_progress', 1)
    `).run(tempGoalId, workspaceId, `${profile.description} — Onboarding Pipeline`, 'Auto-generated pipeline anchor goal');

    // Create 7 pending stage rows
    const stageIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const stageId = `ds-${uuidv4().slice(0, 8)}`;
      stageIds.push(stageId);
      db.prepare(`
        INSERT INTO decomposition_stages (id, goal_id, pipeline_run_id, stage_number, stage_name, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(stageId, tempGoalId, pipelineRunId, i + 1, STAGE_NAMES[i]);
    }

    // Run pipeline asynchronously (don't block the response)
    runPipelineAsync(db, pipelineRunId, stageIds, profile, workspaceId, tempGoalId);

    return NextResponse.json({ pipelineRunId, stages: 7 }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Pipeline]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function runPipelineAsync(
  db: ReturnType<typeof getDb>,
  pipelineRunId: string,
  stageIds: string[],
  profile: Record<string, unknown>,
  workspaceId: string,
  tempGoalId: string,
) {
  const stageOutputs: Record<number, unknown> = {};

  const businessName = String(profile.description || '').slice(0, 100);
  const bmcData = profile.bmc_data ? JSON.parse(String(profile.bmc_data)) : {};
  const coreValues = profile.core_values ? JSON.parse(String(profile.core_values)) : [];

  const companySummary = `${profile.description}\nIndustry: ${profile.industry}\nType: ${profile.business_type}\nStage: ${profile.company_stage}\nRevenue: ${profile.current_revenue}\nTeam: ${profile.team_size}\nProducts: ${profile.key_products}\nChannels: ${profile.primary_channels}`;

  for (let i = 0; i < 7; i++) {
    const stageNum = i + 1;
    const stageId = stageIds[i];

    try {
      // Update to running
      db.prepare(`UPDATE decomposition_stages SET status = 'running', started_at = datetime('now') WHERE id = ?`).run(stageId);
      broadcast({
        type: 'pipeline:stage_update',
        payload: { stageNumber: stageNum, stageName: STAGE_DISPLAY_NAMES[i], status: 'running' },
      });

      // Build prompt for this stage
      let prompt: { system: string; user: string };
      let maxTokens = 8192;

      switch (stageNum) {
        case 1:
          prompt = stage1Prompt({
            company_description: String(profile.description || ''),
            mission_statement: String(profile.mission || ''),
            vision_statement: String(profile.vision || ''),
            industry: String(profile.industry || ''),
            company_stage: String(profile.company_stage || 'startup'),
            current_revenue: String(profile.current_revenue || 'N/A'),
            team_size: Number(profile.team_size) || 1,
            key_products: String(profile.key_products || ''),
            primary_channels: String(profile.primary_channels || ''),
            constraints: String(profile.constraints || ''),
          });
          maxTokens = 16384;
          break;

        case 2:
          prompt = stage2Prompt({
            stage1_output: JSON.stringify(stageOutputs[1]),
          });
          maxTokens = 16384;
          break;

        case 3:
          prompt = stage3Prompt({
            stage2_output: JSON.stringify(stageOutputs[2]),
            company_dna_summary: companySummary,
          });
          maxTokens = 16384;
          break;

        case 4: {
          // Stage 4 runs per-project; aggregate all
          const projects = (stageOutputs[3] as any)?.projects || [];
          const allPlans: unknown[] = [];

          for (const proj of projects) {
            const stage2GoalBranches = JSON.stringify(stageOutputs[2]);
            const contextVars = JSON.stringify(proj.context_variables || []);
            const subPrompt = stage4Prompt({
              project_data: JSON.stringify(proj),
              relevant_stage2_branch: stage2GoalBranches.slice(0, 4000),
              context_variables: contextVars,
            });

            const rawText = await callLLM(subPrompt.system, subPrompt.user, 8192);
            const parsed = extractJSON(rawText);
            if (parsed) {
              allPlans.push(parsed);
            }
          }

          stageOutputs[4] = { all_project_plans: allPlans };
          db.prepare(`UPDATE decomposition_stages SET status = 'completed', output_json = ?, completed_at = datetime('now') WHERE id = ?`)
            .run(JSON.stringify(stageOutputs[4]), stageId);

          broadcast({
            type: 'pipeline:stage_update',
            payload: {
              stageNumber: 4,
              stageName: STAGE_DISPLAY_NAMES[3],
              status: 'completed',
              resultSummary: `${allPlans.length} project plans generated`,
            },
          });
          continue; // skip common path below
        }

        case 5:
          prompt = stage5Prompt({
            stage4_output: JSON.stringify(stageOutputs[4]),
          });
          maxTokens = 16384;
          break;

        case 6:
          prompt = stage6Prompt({
            stage5_output: JSON.stringify(stageOutputs[5]),
            tool_inventory: 'Standard MABOS agent tools: Shopify Admin, SendGrid, Google Analytics, Google Ads, Stripe, social media APIs, database queries, web search, file operations',
          });
          maxTokens = 16384;
          break;

        case 7:
          prompt = stage7Prompt({
            stage2_summary: JSON.stringify(stageOutputs[2]).slice(0, 4000),
            stage3_summary: JSON.stringify(stageOutputs[3]).slice(0, 4000),
            stage4_summary: JSON.stringify(stageOutputs[4]).slice(0, 4000),
            stage5_summary: JSON.stringify(stageOutputs[5]).slice(0, 4000),
            stage6_full_output: JSON.stringify(stageOutputs[6]).slice(0, 8000),
          });
          maxTokens = 16384;
          break;

        default:
          throw new Error(`Unknown stage ${stageNum}`);
      }

      // Call LLM
      const rawText = await callLLM(prompt!.system, prompt!.user, maxTokens);
      const parsed = extractJSON(rawText);

      if (!parsed) {
        throw new Error('Failed to parse JSON from LLM response');
      }

      stageOutputs[stageNum] = parsed;

      // Store output and mark completed
      db.prepare(`UPDATE decomposition_stages SET status = 'completed', output_json = ?, completed_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(parsed), stageId);

      // Compute summary for SSE
      let resultSummary = '';
      if (stageNum === 1) {
        const cats = (parsed as any).goal_categories || [];
        const totalGoals = cats.reduce((sum: number, c: any) => sum + (c.goals?.length || 0), 0);
        resultSummary = `${totalGoals} goals across ${cats.length} categories`;
      } else if (stageNum === 2) {
        const leafCount = (parsed as any).all_leaf_goals?.length || 0;
        resultSummary = `${leafCount} leaf goals identified`;
      } else if (stageNum === 3) {
        const projCount = (parsed as any).projects?.length || 0;
        resultSummary = `${projCount} projects scoped`;
      } else if (stageNum === 5) {
        const taskTotal = (parsed as any).plan_tasks?.reduce((s: number, pt: any) => s + (pt.tasks?.length || 0), 0) || 0;
        resultSummary = `${taskTotal} tasks decomposed`;
      } else if (stageNum === 6) {
        const actionTotal = (parsed as any).task_actions?.reduce((s: number, ta: any) =>
          s + (ta.subtasks?.reduce((ss: number, st: any) => ss + (st.actions?.length || 0), 0) || 0), 0) || 0;
        resultSummary = `${actionTotal} actions mapped`;
      } else if (stageNum === 7) {
        const summary = (parsed as any).execution_plan?.summary || {};
        resultSummary = `${summary.total_goals || 0} goals, ${summary.total_tasks || 0} tasks, ${summary.total_actions || 0} actions`;
      }

      broadcast({
        type: 'pipeline:stage_update',
        payload: { stageNumber: stageNum, stageName: STAGE_DISPLAY_NAMES[i], status: 'completed', resultSummary },
      });

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Pipeline] Stage ${stageNum} failed:`, errMsg);

      db.prepare(`UPDATE decomposition_stages SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`)
        .run(errMsg, stageId);

      broadcast({
        type: 'pipeline:stage_update',
        payload: { stageNumber: stageNum, stageName: STAGE_DISPLAY_NAMES[i], status: 'failed', error: errMsg },
      });

      // Don't continue after failure
      return;
    }
  }

  // ─── Insert results into kanban tables ──────────────────────────
  try {
    const result = insertGoalsFromPipeline(db, workspaceId, workspaceId, {
      stage1: stageOutputs[1] as Record<string, unknown>,
      stage3: stageOutputs[3] as Record<string, unknown>,
      stage5: stageOutputs[5] as Record<string, unknown>,
    });

    console.log(`[Pipeline] Inserted: ${result.goalCount} goals, ${result.campaignCount} campaigns, ${result.taskCount} tasks`);

    // Clean up temp goal
    db.prepare(`UPDATE kanban_goals SET stage = 'done' WHERE id = ?`).run(tempGoalId);

  } catch (error) {
    console.error('[Pipeline] Failed to insert kanban data:', error);
  }
}
