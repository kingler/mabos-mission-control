'use client';

import type { GraphFilters } from '@/types/graph';

interface GraphFilterPanelProps {
  filters: GraphFilters;
  onFilterChange: (filters: GraphFilters) => void;
  agents: { id: string; label: string }[];
}

const NODE_TYPES = [
  { key: 'showAgents' as const, label: 'Agents', color: '#3b82f6' },
  { key: 'showGoals' as const, label: 'Goals', color: '#22c55e' },
  { key: 'showCampaigns' as const, label: 'Campaigns', color: '#ec4899' },
  { key: 'showInitiatives' as const, label: 'Initiatives', color: '#06b6d4' },
  { key: 'showTasks' as const, label: 'Tasks', color: '#f59e0b' },
];

export function GraphFilterPanel({ filters, onFilterChange, agents }: GraphFilterPanelProps) {
  const toggle = (key: keyof GraphFilters) => {
    onFilterChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div className="absolute top-4 left-4 z-10 bg-zinc-900/95 border border-zinc-800 rounded-lg p-3 w-52 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Filter Nodes</div>
      <div className="space-y-1.5">
        {NODE_TYPES.map(({ key, label, color }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={filters[key] as boolean}
              onChange={() => toggle(key)}
              className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5"
            />
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
              {label}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-800">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Agent</div>
        <select
          value={filters.selectedAgent || ''}
          onChange={(e) =>
            onFilterChange({ ...filters, selectedAgent: e.target.value || null })
          }
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
