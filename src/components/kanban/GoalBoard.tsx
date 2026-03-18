'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Target } from 'lucide-react';
import type { KanbanStage, KanbanDomain } from '@/lib/types/kanban';

interface GoalRow {
  id: string;
  title: string;
  description?: string;
  domain: string;
  stage: string;
  priority: number;
  progress_pct: number;
  meta_type: string;
  owner_id?: string;
  target_date?: string;
  campaign_count: number;
  initiative_count: number;
  task_count: number;
  completed_task_count: number;
}

const COLUMNS: { id: KanbanStage; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'border-t-mc-text-secondary' },
  { id: 'ready', label: 'Ready', color: 'border-t-mc-accent' },
  { id: 'in_progress', label: 'In Progress', color: 'border-t-mc-accent-yellow' },
  { id: 'blocked', label: 'Blocked', color: 'border-t-mc-accent-red' },
  { id: 'review', label: 'Review', color: 'border-t-mc-accent-purple' },
  { id: 'done', label: 'Done', color: 'border-t-mc-accent-green' },
];

const DOMAIN_COLORS: Record<string, string> = {
  product: 'bg-mc-accent/20 text-mc-accent',
  marketing: 'bg-mc-accent-pink/20 text-mc-accent-pink',
  operations: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  finance: 'bg-mc-accent-green/20 text-mc-accent-green',
  technology: 'bg-mc-accent-purple/20 text-mc-accent-purple',
  strategy: 'bg-mc-accent-cyan/20 text-mc-accent-cyan',
  legal: 'bg-orange-500/20 text-orange-400',
  hr: 'bg-pink-500/20 text-pink-400',
};

interface GoalBoardProps {
  businessId: string;
  onDrillDown: (goalId: string, goalTitle: string) => void;
}

export function GoalBoard({ businessId, onDrillDown }: GoalBoardProps) {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compactEmpty, setCompactEmpty] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/kanban/goals?businessId=${businessId}`);
        if (res.ok) {
          const data = await res.json();
          setGoals(data.goals || []);
        }
      } catch (err) {
        console.error('Failed to load goals:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessId]);

  const getGoalsByStage = (stage: KanbanStage) => goals.filter(g => g.stage === stage);

  const getColumnWidth = (count: number): string => {
    if (!compactEmpty) return '280px';
    if (count === 0) return 'fit-content';
    return `${Math.min(380, 250 + count * 14)}px`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-mc-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-mc-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-mc-accent" />
          <span className="text-sm font-medium uppercase tracking-wider">Strategic Goals</span>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{goals.length}</span>
        </div>
      </div>

      <div className="mission-queue-scroll-x flex-1 flex gap-3 p-3 overflow-x-auto">
        {COLUMNS.map(column => {
          const columnGoals = getGoalsByStage(column.id);
          const hasTasks = columnGoals.length > 0;
          return (
            <div
              key={column.id}
              style={{ width: getColumnWidth(columnGoals.length) }}
              className={`flex-none ${compactEmpty ? (hasTasks ? 'min-w-[240px]' : 'min-w-[110px] max-w-[180px]') : 'min-w-[250px] max-w-[320px]'} flex flex-col bg-mc-bg rounded-lg border border-mc-border/50 border-t-2 transition-[width] duration-200 ${column.color}`}
            >
              <div className="p-2 border-b border-mc-border flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase text-mc-text-secondary whitespace-nowrap">{column.label}</span>
                <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{columnGoals.length}</span>
              </div>
              <div className={`flex-1 overflow-y-auto p-2 ${hasTasks ? 'space-y-2' : ''}`}>
                {columnGoals.map(goal => (
                  <GoalCard key={goal.id} goal={goal} onClick={() => onDrillDown(goal.id, goal.title)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalCard({ goal, onClick }: { goal: GoalRow; onClick: () => void }) {
  const taskPct = goal.task_count > 0 ? Math.round((goal.completed_task_count / goal.task_count) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className="bg-mc-bg-secondary border border-mc-border/50 rounded-lg p-3 cursor-pointer hover:border-mc-accent/40 hover:shadow-lg hover:shadow-black/20 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium leading-snug line-clamp-2">{goal.title}</h4>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${DOMAIN_COLORS[goal.domain] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
          {goal.domain}
        </span>
        <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-mc-bg-tertiary text-mc-text-secondary">
          {goal.meta_type}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-mc-accent rounded-full transition-all duration-500"
            style={{ width: `${Math.max(goal.progress_pct, 1)}%` }}
          />
        </div>
        <div className="text-[10px] text-mc-text-secondary mt-0.5">{goal.progress_pct}% complete</div>
      </div>

      {/* Counts */}
      <div className="flex items-center justify-between text-[10px] text-mc-text-secondary pt-2 border-t border-mc-border/20">
        <span>{goal.campaign_count} campaigns</span>
        <span>{goal.completed_task_count}/{goal.task_count} tasks</span>
      </div>
    </div>
  );
}
