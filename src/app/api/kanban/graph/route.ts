import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { GraphNode, GraphLink } from '@/types/graph';

interface AgentRow {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface GoalRow {
  id: string;
  title: string;
  stage: string;
  domain: string;
  owner_id: string | null;
}

interface CampaignRow {
  id: string;
  goal_id: string;
  title: string;
  stage: string;
  owner_id: string | null;
}

interface PlanRow {
  id: string;
  agent_id: string;
  goal_id: string | null;
  title: string;
  status: string;
  source: string;
}

interface InitiativeRow {
  id: string;
  campaign_id: string;
  goal_id: string;
  title: string;
  stage: string;
  owner_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  assigned_agent_id: string | null;
  goal_id: string | null;
  initiative_id: string | null;
  campaign_id: string | null;
}

interface SkillRow {
  skill_name: string;
  category: string;
  description: string;
}

interface AgentSkillRow {
  agent_id: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentFilter = searchParams.get('agent');
    const businessId = searchParams.get('businessId') || 'vividwalls';

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeIds = new Set<string>();

    const agents = queryAll<AgentRow>(
      'SELECT id, name, role, status FROM agents'
    );

    const goals = queryAll<GoalRow>(
      'SELECT id, title, stage, domain, owner_id FROM kanban_goals WHERE business_id = ?',
      [businessId]
    );

    const campaigns = queryAll<CampaignRow>(
      'SELECT id, goal_id, title, stage, owner_id FROM kanban_campaigns WHERE business_id = ?',
      [businessId]
    );

    const plans = queryAll<PlanRow>(
      'SELECT id, agent_id, goal_id, title, status, source FROM agent_plans WHERE business_id = ?',
      [businessId]
    );

    const initiatives = queryAll<InitiativeRow>(
      'SELECT id, campaign_id, goal_id, title, stage, owner_id FROM kanban_initiatives WHERE business_id = ?',
      [businessId]
    );

    const tasks = queryAll<TaskRow>(
      `SELECT t.id, t.title, t.status, t.assigned_agent_id,
              m.goal_id, m.initiative_id, m.campaign_id
       FROM tasks t
       LEFT JOIN kanban_card_meta m ON m.task_id = t.id
       WHERE t.business_id = ?`,
      [businessId]
    );

    // Agent nodes
    for (const agent of agents) {
      if (agentFilter && agent.id !== agentFilter) continue;
      nodeIds.add(agent.id);
      nodes.push({
        id: agent.id,
        label: agent.name,
        type: 'agent',
        status: agent.status,
        val: 12,
      });
    }

    // Goal nodes + agent->goal links
    for (const goal of goals) {
      if (agentFilter && goal.owner_id !== agentFilter) continue;
      nodeIds.add(goal.id);
      nodes.push({
        id: goal.id,
        label: goal.title,
        type: 'goal',
        status: goal.stage,
        agent: goal.owner_id || undefined,
        tier: 1,
        val: 8,
      });
      if (goal.owner_id && nodeIds.has(goal.owner_id)) {
        links.push({ source: goal.owner_id, target: goal.id, relation: 'owns' });
      }
    }

    // Campaign nodes + goal->campaign links
    const goalIds = new Set(goals.map(g => g.id));
    for (const campaign of campaigns) {
      if (agentFilter && campaign.owner_id !== agentFilter) continue;
      if (!goalIds.has(campaign.goal_id) && agentFilter) continue;
      nodeIds.add(campaign.id);
      nodes.push({
        id: campaign.id,
        label: campaign.title,
        type: 'campaign',
        status: campaign.stage,
        agent: campaign.owner_id || undefined,
        tier: 2,
        val: 6,
      });
      if (nodeIds.has(campaign.goal_id)) {
        links.push({ source: campaign.goal_id, target: campaign.id, relation: 'decomposes' });
      }
    }

    // Plan nodes + goal->plan and agent->plan links
    for (const plan of plans) {
      if (agentFilter && plan.agent_id !== agentFilter) continue;
      nodeIds.add(plan.id);
      nodes.push({
        id: plan.id,
        label: plan.title,
        type: 'plan',
        status: plan.status,
        agent: plan.agent_id,
        tier: 2.5,
        val: 5,
      });
      if (plan.goal_id && nodeIds.has(plan.goal_id)) {
        links.push({ source: plan.goal_id, target: plan.id, relation: 'executes' });
      }
      if (nodeIds.has(plan.agent_id)) {
        links.push({ source: plan.agent_id, target: plan.id, relation: 'owns' });
      }
    }

    // Initiative nodes + campaign->initiative links
    const campaignIds = new Set(campaigns.map(c => c.id));
    for (const initiative of initiatives) {
      if (agentFilter && initiative.owner_id !== agentFilter) continue;
      if (!campaignIds.has(initiative.campaign_id) && agentFilter) continue;
      nodeIds.add(initiative.id);
      nodes.push({
        id: initiative.id,
        label: initiative.title,
        type: 'initiative',
        status: initiative.stage,
        agent: initiative.owner_id || undefined,
        tier: 3,
        val: 4,
      });
      if (nodeIds.has(initiative.campaign_id)) {
        links.push({ source: initiative.campaign_id, target: initiative.id, relation: 'contains' });
      }
    }

    // Task nodes + hierarchy links
    for (const task of tasks) {
      if (agentFilter && task.assigned_agent_id !== agentFilter) continue;
      nodeIds.add(task.id);
      nodes.push({
        id: task.id,
        label: task.title,
        type: 'task',
        status: task.status,
        agent: task.assigned_agent_id || undefined,
        tier: 4,
        val: 2,
      });
      if (task.initiative_id && nodeIds.has(task.initiative_id)) {
        links.push({ source: task.initiative_id, target: task.id, relation: 'assigned' });
      } else if (task.campaign_id && nodeIds.has(task.campaign_id)) {
        links.push({ source: task.campaign_id, target: task.id, relation: 'assigned' });
      } else if (task.goal_id && nodeIds.has(task.goal_id)) {
        links.push({ source: task.goal_id, target: task.id, relation: 'assigned' });
      }
      if (task.assigned_agent_id && nodeIds.has(task.assigned_agent_id)) {
        links.push({ source: task.assigned_agent_id, target: task.id, relation: 'works_on' });
      }
    }

    // Skill nodes — deduplicated by skill_name, linked to agents via possesses
    const skills = queryAll<SkillRow>(
      'SELECT DISTINCT skill_name, category, description FROM agent_skills WHERE business_id = ?',
      [businessId]
    );

    for (const s of skills) {
      const skillNodeId = `skill--${s.skill_name}`;
      nodeIds.add(skillNodeId);
      nodes.push({
        id: skillNodeId,
        label: s.skill_name,
        type: 'skill',
        tier: 5,
        val: 1,
      });

      const agentSkills = queryAll<AgentSkillRow>(
        'SELECT DISTINCT agent_id FROM agent_skills WHERE skill_name = ? AND business_id = ?',
        [s.skill_name, businessId]
      );

      for (const as of agentSkills) {
        if (nodeIds.has(as.agent_id)) {
          links.push({ source: as.agent_id, target: skillNodeId, relation: 'possesses' });
        }
      }
    }

    return NextResponse.json({
      nodes,
      links,
      meta: {
        nodeCount: nodes.length,
        linkCount: links.length,
        breakdown: {
          agents: nodes.filter(n => n.type === 'agent').length,
          goals: nodes.filter(n => n.type === 'goal').length,
          campaigns: nodes.filter(n => n.type === 'campaign').length,
          plans: nodes.filter(n => n.type === 'plan').length,
          initiatives: nodes.filter(n => n.type === 'initiative').length,
          tasks: nodes.filter(n => n.type === 'task').length,
          skills: nodes.filter(n => n.type === 'skill').length,
        },
      },
    });
  } catch (error) {
    console.error('[Graph API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to build graph data' },
      { status: 500 }
    );
  }
}
