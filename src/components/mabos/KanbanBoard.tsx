'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Rocket,
  Lightbulb,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Activity,
  BarChart3,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────

interface Goal {
  id: string;
  title: string;
  description?: string;
  meta_type: string;
  domain: string;
  stage: string;
  owner_id?: string;
  priority: number;
  target_date?: string;
  progress_pct: number;
  kpi_definition?: string;
  tags?: string;
  campaign_count: number;
  initiative_count: number;
  task_count: number;
  completed_task_count: number;
  campaigns?: Campaign[];
}

interface Campaign {
  id: string;
  goal_id: string;
  title: string;
  description?: string;
  meta_type: string;
  domain: string;
  stage: string;
  priority: number;
  start_date?: string;
  end_date?: string;
  progress_pct: number;
  task_count: number;
  initiative_count?: number;
  initiatives?: Initiative[];
}

interface Initiative {
  id: string;
  campaign_id: string;
  title: string;
  description?: string;
  stage: string;
  priority: number;
  progress_pct: number;
  task_count: number;
}

interface BdiEntry {
  id: string;
  agent_id: string;
  bdi_state: string;
  transition_type: string;
  ref_tier: string;
  ref_id: string;
  summary: string;
  confidence?: number;
  created_at: string;
}

// ─── Stage config ─────────────────────────────────────────────────────

const STAGES = ['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done'] as const;

const STAGE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

const STAGE_COLORS: Record<string, string> = {
  backlog: 'border-mc-text-secondary/30',
  ready: 'border-mc-accent/50',
  in_progress: 'border-mc-accent-cyan/50',
  blocked: 'border-mc-accent-red/50',
  review: 'border-mc-accent-purple/50',
  done: 'border-mc-accent-green/50',
  cancelled: 'border-mc-text-secondary/20',
};

const DOMAIN_COLORS: Record<string, string> = {
  product: 'bg-blue-500/20 text-blue-400',
  marketing: 'bg-purple-500/20 text-purple-400',
  finance: 'bg-green-500/20 text-green-400',
  operations: 'bg-yellow-500/20 text-yellow-400',
  technology: 'bg-cyan-500/20 text-cyan-400',
  legal: 'bg-red-500/20 text-red-400',
  hr: 'bg-pink-500/20 text-pink-400',
  strategy: 'bg-indigo-500/20 text-indigo-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────

function ProgressBar({ pct, size = 'sm' }: { pct: number; size?: 'sm' | 'md' }) {
  const h = size === 'md' ? 'h-2' : 'h-1.5';
  return (
    <div className={`w-full bg-mc-bg-tertiary rounded-full ${h} overflow-hidden`}>
      <div
        className={`${h} rounded-full transition-all ${pct >= 100 ? 'bg-mc-accent-green' : pct > 0 ? 'bg-mc-accent' : 'bg-mc-text-secondary/30'}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function DomainBadge({ domain }: { domain: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${DOMAIN_COLORS[domain] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
      {domain}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    backlog: 'text-mc-text-secondary',
    ready: 'text-mc-accent',
    in_progress: 'text-mc-accent-cyan',
    blocked: 'text-mc-accent-red',
    review: 'text-mc-accent-purple',
    done: 'text-mc-accent-green',
    cancelled: 'text-mc-text-secondary/50',
  };
  return <span className={`text-[10px] font-medium uppercase ${colors[stage] || ''}`}>{STAGE_LABELS[stage] || stage}</span>;
}

// ─── Initiative Card ──────────────────────────────────────────────────

function InitiativeCard({ initiative }: { initiative: Initiative }) {
  return (
    <div className="bg-mc-bg rounded border border-mc-border/50 p-2 hover:border-mc-border transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Lightbulb className="w-3 h-3 text-mc-accent-yellow shrink-0" />
          <span className="text-xs font-medium truncate">{initiative.title}</span>
        </div>
        <StageBadge stage={initiative.stage} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <ProgressBar pct={initiative.progress_pct} />
        <span className="text-[10px] text-mc-text-secondary shrink-0">{Math.round(initiative.progress_pct)}%</span>
      </div>
      {initiative.task_count > 0 && (
        <div className="mt-1 text-[10px] text-mc-text-secondary flex items-center gap-1">
          <CheckSquare className="w-2.5 h-2.5" />
          {initiative.task_count} task{initiative.task_count !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────

function CampaignCard({ campaign, expanded, onToggle }: {
  campaign: Campaign;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`bg-mc-bg-secondary rounded-lg border ${STAGE_COLORS[campaign.stage] || 'border-mc-border'} overflow-hidden`}>
      <button onClick={onToggle} className="w-full text-left p-3 hover:bg-mc-bg-tertiary/50 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-mc-text-secondary shrink-0" />}
            <Rocket className="w-3.5 h-3.5 text-mc-accent-purple shrink-0" />
            <span className="text-sm font-medium truncate">{campaign.title}</span>
          </div>
          <StageBadge stage={campaign.stage} />
        </div>
        <div className="mt-2 ml-7 flex items-center gap-3">
          <ProgressBar pct={campaign.progress_pct} size="md" />
          <span className="text-xs text-mc-text-secondary shrink-0">{Math.round(campaign.progress_pct)}%</span>
        </div>
        <div className="mt-1.5 ml-7 flex items-center gap-3 text-[10px] text-mc-text-secondary">
          {campaign.start_date && <span>{campaign.start_date} → {campaign.end_date || '...'}</span>}
          {(campaign.initiative_count ?? 0) > 0 && <span>{campaign.initiative_count} initiative{(campaign.initiative_count ?? 0) !== 1 ? 's' : ''}</span>}
          {campaign.task_count > 0 && <span>{campaign.task_count} task{campaign.task_count !== 1 ? 's' : ''}</span>}
        </div>
      </button>

      {expanded && campaign.initiatives && campaign.initiatives.length > 0 && (
        <div className="border-t border-mc-border/50 p-2 space-y-1.5 bg-mc-bg/50">
          {campaign.initiatives.map(init => (
            <InitiativeCard key={init.id} initiative={init} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────

function GoalCard({ goal, expanded, onToggle, onExpand }: {
  goal: Goal;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const kpi = goal.kpi_definition ? JSON.parse(goal.kpi_definition) : null;
  const tags: string[] = goal.tags ? JSON.parse(goal.tags) : [];
  const [campaignExpanded, setCampaignExpanded] = useState<Set<string>>(new Set());

  const toggleCampaign = (id: string) => {
    setCampaignExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className={`bg-mc-bg-secondary rounded-lg border-l-4 ${STAGE_COLORS[goal.stage] || 'border-mc-border'} border border-mc-border overflow-hidden`}>
      {/* Goal header */}
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-mc-bg-tertiary/30 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {expanded ? <ChevronDown className="w-4 h-4 text-mc-text-secondary shrink-0" /> : <ChevronRight className="w-4 h-4 text-mc-text-secondary shrink-0" />}
            <Target className="w-4 h-4 text-mc-accent shrink-0" />
            <h3 className="text-sm font-semibold truncate">{goal.title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DomainBadge domain={goal.domain} />
            <StageBadge stage={goal.stage} />
          </div>
        </div>

        {goal.description && (
          <p className="text-xs text-mc-text-secondary mt-1.5 ml-8 line-clamp-2">{goal.description}</p>
        )}

        {/* Progress bar */}
        <div className="mt-3 ml-8 flex items-center gap-3">
          <ProgressBar pct={goal.progress_pct} size="md" />
          <span className="text-xs font-medium text-mc-text shrink-0">{Math.round(goal.progress_pct)}%</span>
        </div>

        {/* Stats row */}
        <div className="mt-2 ml-8 flex items-center gap-4 text-[11px] text-mc-text-secondary">
          <span className="flex items-center gap-1">
            <Rocket className="w-3 h-3" /> {goal.campaign_count} campaign{goal.campaign_count !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Lightbulb className="w-3 h-3" /> {goal.initiative_count} initiative{goal.initiative_count !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <CheckSquare className="w-3 h-3" /> {goal.completed_task_count}/{goal.task_count} tasks
          </span>
          {goal.target_date && <span>Due: {goal.target_date}</span>}
          {kpi && <span>KPI: {kpi.target} {kpi.unit}</span>}
        </div>

        {tags.length > 0 && (
          <div className="mt-2 ml-8 flex gap-1 flex-wrap">
            {tags.map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">{tag}</span>
            ))}
          </div>
        )}
      </button>

      {/* Campaigns (expanded) */}
      {expanded && (
        <div className="border-t border-mc-border p-3 space-y-2 bg-mc-bg/30">
          {goal.campaigns && goal.campaigns.length > 0 ? (
            goal.campaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                expanded={campaignExpanded.has(c.id)}
                onToggle={() => toggleCampaign(c.id)}
              />
            ))
          ) : (
            <p className="text-xs text-mc-text-secondary text-center py-2">No campaigns yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BDI Feed ─────────────────────────────────────────────────────────

function BdiFeed({ entries }: { entries: BdiEntry[] }) {
  const stateIcons: Record<string, string> = {
    belief: '💭', desire: '⭐', intention: '🎯', action: '⚡',
  };
  const typeColors: Record<string, string> = {
    desire_adopted: 'text-mc-accent-yellow',
    intention_committed: 'text-mc-accent-purple',
    plan_selected: 'text-mc-accent-cyan',
    action_executed: 'text-mc-accent-green',
    goal_achieved: 'text-mc-accent-green',
    goal_dropped: 'text-mc-accent-red',
    belief_revised: 'text-mc-accent',
  };

  return (
    <div className="space-y-1.5">
      {entries.map(e => (
        <div key={e.id} className="flex items-start gap-2 text-xs bg-mc-bg rounded p-2 border border-mc-border/30">
          <span className="text-sm shrink-0">{stateIcons[e.bdi_state] || '❓'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${typeColors[e.transition_type] || ''}`}>
                {e.transition_type.replace(/_/g, ' ')}
              </span>
              <span className="text-mc-text-secondary">{e.agent_id}</span>
              {e.confidence != null && (
                <span className="text-mc-text-secondary/60">{Math.round(e.confidence * 100)}%</span>
              )}
            </div>
            <p className="text-mc-text-secondary truncate mt-0.5">{e.summary}</p>
          </div>
          <span className="text-[10px] text-mc-text-secondary/50 shrink-0">
            {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-xs text-mc-text-secondary text-center py-4">No BDI declarations yet</p>
      )}
    </div>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────

export function KanbanBoard() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bdiLog, setBdiLog] = useState<BdiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'hierarchy' | 'board'>('hierarchy');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [goalsRes, bdiRes] = await Promise.all([
        fetch('/api/kanban/goals'),
        fetch('/api/kanban/bdi-log?limit=20'),
      ]);

      if (goalsRes.ok) {
        const data = await goalsRes.json();
        const goalsData = data.goals || [];

        // Load hierarchy for each goal
        const withHierarchy = await Promise.all(
          goalsData.map(async (g: Goal) => {
            try {
              const res = await fetch(`/api/kanban/goals/${g.id}`);
              if (res.ok) return res.json();
            } catch {}
            return g;
          })
        );

        setGoals(withHierarchy);
        // Expand in-progress goals by default
        setExpandedGoals(new Set(withHierarchy.filter((g: Goal) => g.stage === 'in_progress').map((g: Goal) => g.id)));
      }

      if (bdiRes.ok) {
        const data = await bdiRes.json();
        setBdiLog(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to load kanban data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleGoal = (id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Stage-grouped view (board)
  const goalsByStage = STAGES.reduce((acc, stage) => {
    acc[stage] = goals.filter(g => g.stage === stage);
    return acc;
  }, {} as Record<string, Goal[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-mc-accent" />
          <h2 className="text-lg font-semibold">Goal-Driven Kanban</h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">
            {goals.length} goal{goals.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-mc-bg rounded border border-mc-border overflow-hidden">
            <button
              onClick={() => setView('hierarchy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === 'hierarchy' ? 'bg-mc-bg-tertiary text-mc-text' : 'text-mc-text-secondary hover:text-mc-text'}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Hierarchy
            </button>
            <button
              onClick={() => setView('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === 'board' ? 'bg-mc-bg-tertiary text-mc-text' : 'text-mc-text-secondary hover:text-mc-text'}`}
            >
              <Activity className="w-3.5 h-3.5" />
              Board
            </button>
          </div>
          <button onClick={loadData} className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main content area (2/3) */}
        <div className="lg:col-span-2 space-y-3">
          {view === 'hierarchy' ? (
            /* Hierarchy view — goals as expandable cards */
            goals.length > 0 ? (
              goals.map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  expanded={expandedGoals.has(goal.id)}
                  onToggle={() => toggleGoal(goal.id)}
                  onExpand={() => {}}
                />
              ))
            ) : (
              <div className="text-center py-12 text-mc-text-secondary">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No goals defined yet</p>
              </div>
            )
          ) : (
            /* Board view — columns by stage */
            <div className="grid grid-cols-6 gap-2 min-h-[400px]">
              {STAGES.map(stage => (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between px-2 py-1.5 bg-mc-bg-secondary rounded border border-mc-border">
                    <span className="text-[10px] font-semibold uppercase text-mc-text-secondary">
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-[10px] text-mc-text-secondary/60">
                      {(goalsByStage[stage] || []).length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {(goalsByStage[stage] || []).map(goal => (
                      <div
                        key={goal.id}
                        className={`bg-mc-bg-secondary rounded border-l-2 ${STAGE_COLORS[stage]} border border-mc-border p-2 hover:bg-mc-bg-tertiary/50 transition-colors cursor-pointer`}
                        onClick={() => { setView('hierarchy'); setExpandedGoals(new Set([goal.id])); }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Target className="w-3 h-3 text-mc-accent shrink-0" />
                          <span className="text-xs font-medium truncate">{goal.title}</span>
                        </div>
                        <DomainBadge domain={goal.domain} />
                        <div className="mt-1.5 flex items-center gap-2">
                          <ProgressBar pct={goal.progress_pct} />
                          <span className="text-[10px] text-mc-text-secondary">{Math.round(goal.progress_pct)}%</span>
                        </div>
                        <div className="mt-1 text-[9px] text-mc-text-secondary">
                          {goal.campaign_count}C · {goal.initiative_count}I · {goal.task_count}T
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BDI Activity Feed (1/3 sidebar) */}
        <div className="space-y-3">
          <div className="bg-mc-bg-secondary rounded-lg border border-mc-border p-3">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-mc-accent-cyan" />
              <h3 className="text-sm font-semibold">BDI Activity</h3>
              <span className="text-[10px] text-mc-text-secondary">{bdiLog.length} recent</span>
            </div>
            <BdiFeed entries={bdiLog} />
          </div>

          {/* Summary stats */}
          <div className="bg-mc-bg-secondary rounded-lg border border-mc-border p-3">
            <h3 className="text-sm font-semibold mb-2">Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'In Progress', value: goals.filter(g => g.stage === 'in_progress').length, color: 'text-mc-accent-cyan' },
                { label: 'Backlog', value: goals.filter(g => g.stage === 'backlog').length, color: 'text-mc-text-secondary' },
                { label: 'Total Campaigns', value: goals.reduce((s, g) => s + g.campaign_count, 0), color: 'text-mc-accent-purple' },
                { label: 'Total Tasks', value: goals.reduce((s, g) => s + g.task_count, 0), color: 'text-mc-accent-green' },
              ].map(stat => (
                <div key={stat.label} className="bg-mc-bg rounded p-2 border border-mc-border/30">
                  <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] text-mc-text-secondary">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
