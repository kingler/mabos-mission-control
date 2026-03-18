'use client';

import { useEffect, useState, useRef } from 'react';
import { Brain, Database, BookOpen, Lightbulb, MessageSquare, GitBranch, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMissionControl } from '@/lib/store';
import type { AgentCognitiveActivity, ActivityCategory } from '@/lib/mabos/types';

const CATEGORY_CONFIG: Record<ActivityCategory, { icon: typeof Brain; color: string; label: string }> = {
  bdi: { icon: Brain, color: 'text-purple-400', label: 'BDI' },
  memory: { icon: Database, color: 'text-blue-400', label: 'Memory' },
  knowledge: { icon: BookOpen, color: 'text-green-400', label: 'Knowledge' },
  reasoning: { icon: Lightbulb, color: 'text-orange-400', label: 'Reasoning' },
  communication: { icon: MessageSquare, color: 'text-yellow-400', label: 'Comms' },
  workflow: { icon: GitBranch, color: 'text-gray-400', label: 'Workflow' },
};

const CATEGORY_FILTERS: (ActivityCategory | 'all')[] = ['all', 'bdi', 'memory', 'knowledge', 'reasoning', 'communication', 'workflow'];

interface CognitiveActivityFeedProps {
  agentId?: string;
  compact?: boolean;
  maxItems?: number;
}

export function CognitiveActivityFeed({ agentId, compact = false, maxItems }: CognitiveActivityFeedProps) {
  const { cognitiveActivities, activityFilter, setActivityFilter } = useMissionControl();
  const [historicalActivities, setHistoricalActivities] = useState<AgentCognitiveActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadActivities();
  }, [agentId]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const url = agentId
        ? `/api/mabos/agents/${agentId}/activities?limit=50`
        : '/api/mabos/activities?limit=50';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistoricalActivities(data.activities || []);
      }
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  };

  // Merge live SSE activities with historical (dedup by id)
  const allActivities = (() => {
    const seen = new Set<string>();
    const merged: AgentCognitiveActivity[] = [];
    for (const a of cognitiveActivities) {
      if (agentId && a.agent_id !== agentId) continue;
      if (!seen.has(a.id)) {
        seen.add(a.id);
        merged.push(a);
      }
    }
    for (const a of historicalActivities) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        merged.push(a);
      }
    }
    return merged;
  })();

  const filtered = activityFilter === 'all'
    ? allActivities
    : allActivities.filter(a => a.category === activityFilter);

  const displayed = maxItems ? filtered.slice(0, maxItems) : filtered;

  return (
    <div className="flex flex-col h-full">
      {!compact && (
        <div className="flex gap-1 p-2 overflow-x-auto border-b border-mc-border">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => setActivityFilter(cat)}
              className={`min-h-9 px-3 text-xs rounded whitespace-nowrap capitalize ${
                activityFilter === cat
                  ? 'bg-mc-accent text-mc-bg font-medium'
                  : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="text-center py-8 text-mc-text-secondary text-sm">Loading activities...</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-8 text-mc-text-secondary text-sm">No cognitive activities yet</div>
        ) : (
          displayed.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} compact={compact} />
          ))
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity, compact }: { activity: AgentCognitiveActivity; compact?: boolean }) {
  const config = CATEGORY_CONFIG[activity.category] || CATEGORY_CONFIG.workflow;
  const Icon = config.icon;

  return (
    <div className={`p-2 rounded border-l-2 hover:bg-mc-bg-tertiary transition-colors ${
      activity.outcome === 'error' ? 'border-red-500/60' : 'border-transparent'
    }`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase font-medium ${config.color}`}>{config.label}</span>
            {!compact && (
              <span className="text-[10px] text-mc-text-secondary">{activity.agent_id}</span>
            )}
            {activity.duration_ms > 0 && (
              <span className="text-[10px] text-mc-text-secondary">{activity.duration_ms}ms</span>
            )}
          </div>
          <p className="text-sm text-mc-text truncate">{activity.summary}</p>
          <div className="text-[10px] text-mc-text-secondary mt-0.5">
            {activity.tool_name} &middot; {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}
