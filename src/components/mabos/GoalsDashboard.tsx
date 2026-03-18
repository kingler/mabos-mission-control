'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Target, RefreshCw } from 'lucide-react';

interface Goal {
  id: string;
  name: string;
  text?: string;
  description: string;
  level: string;
  type: string;
  priority: number;
  actor?: string;
  parentGoalId?: string;
}

interface GoalModel {
  actors: { id: string; name: string; type: string; goals: string[] }[];
  goals: Goal[];
  dependencies: unknown[];
  refinements?: { parentGoalId: string; childGoalId: string; type: string }[];
}

export function GoalsDashboard() {
  const [model, setModel] = useState<GoalModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mabos/goals');
      if (res.ok) {
        const data = await res.json();
        setModel(data);
        // Expand strategic goals by default
        const strategic = (data.goals || []).filter((g: Goal) => g.level === 'strategic').map((g: Goal) => g.id);
        setExpandedGoals(new Set(strategic));
      }
    } catch (err) {
      console.error('Failed to load goals:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleGoal = (id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getLevelBadge = (level: string) => {
    const styles: Record<string, string> = {
      strategic: 'bg-purple-500/20 text-purple-400',
      tactical: 'bg-blue-500/20 text-blue-400',
      operational: 'bg-green-500/20 text-green-400',
    };
    return styles[level] || 'bg-mc-bg-tertiary text-mc-text-secondary';
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      hardgoal: 'bg-red-500/20 text-red-400',
      softgoal: 'bg-yellow-500/20 text-yellow-400',
      task: 'bg-cyan-500/20 text-cyan-400',
      resource: 'bg-orange-500/20 text-orange-400',
    };
    return styles[type] || 'bg-mc-bg-tertiary text-mc-text-secondary';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
      </div>
    );
  }

  if (!model) {
    return <p className="text-mc-text-secondary p-4">Failed to load goals.</p>;
  }

  const rootGoals = model.goals.filter(g => !g.parentGoalId);
  const childrenOf = (parentId: string) => model.goals.filter(g => g.parentGoalId === parentId);

  const renderGoal = (goal: Goal, depth: number = 0) => {
    const children = childrenOf(goal.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedGoals.has(goal.id);

    return (
      <div key={goal.id}>
        <div
          className={`flex items-start gap-2 p-3 rounded-lg hover:bg-mc-bg-tertiary transition-colors ${depth > 0 ? 'ml-6' : ''}`}
        >
          {hasChildren ? (
            <button onClick={() => toggleGoal(goal.id)} className="p-0.5 mt-0.5">
              {isExpanded ? <ChevronDown className="w-4 h-4 text-mc-text-secondary" /> : <ChevronRight className="w-4 h-4 text-mc-text-secondary" />}
            </button>
          ) : (
            <div className="w-5" />
          )}

          <Target className="w-4 h-4 text-mc-accent mt-0.5 flex-shrink-0" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{goal.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getLevelBadge(goal.level)}`}>{goal.level}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getTypeBadge(goal.type)}`}>{goal.type}</span>
              {goal.actor && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">{goal.actor}</span>
              )}
            </div>
            {goal.description && (
              <p className="text-xs text-mc-text-secondary mt-1 line-clamp-2">{goal.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            {Array.from({ length: goal.priority }, (_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-mc-accent-yellow" />
            ))}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-mc-border/30 ml-4">
            {children.map(child => renderGoal(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-mc-accent" />
          <h2 className="text-lg font-semibold">Goals</h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{model.goals.length}</span>
        </div>
        <button onClick={loadGoals} className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {model.actors.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {model.actors.map(a => (
            <span key={a.id} className="text-xs px-2 py-1 bg-mc-bg-tertiary rounded border border-mc-border/50">
              {a.name} ({a.type})
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {rootGoals.map(goal => renderGoal(goal))}
      </div>
    </div>
  );
}
