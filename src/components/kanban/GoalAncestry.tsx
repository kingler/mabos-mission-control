'use client';

import { ChevronRight, Home } from 'lucide-react';

export type WorkspaceView = 'queue' | 'goals' | 'campaigns' | 'initiatives' | 'delivery' | 'metrics' | 'monitor';

export interface DrillDownState {
  goalId?: string;
  goalTitle?: string;
  campaignId?: string;
  campaignTitle?: string;
  initiativeId?: string;
  initiativeTitle?: string;
}

interface GoalAncestryProps {
  drillDown: DrillDownState;
  onNavigate: (view: WorkspaceView) => void;
  activeView: WorkspaceView;
}

export function GoalAncestry({ drillDown, onNavigate, activeView }: GoalAncestryProps) {
  const crumbs: { label: string; view: WorkspaceView; active: boolean }[] = [];

  // Always show Goals as root
  crumbs.push({ label: 'Goals', view: 'goals', active: activeView === 'goals' });

  if (drillDown.goalId && (activeView === 'campaigns' || activeView === 'initiatives' || activeView === 'delivery')) {
    crumbs.push({ label: drillDown.goalTitle || drillDown.goalId, view: 'campaigns', active: activeView === 'campaigns' });
  }

  if (drillDown.campaignId && (activeView === 'initiatives' || activeView === 'delivery')) {
    crumbs.push({ label: drillDown.campaignTitle || drillDown.campaignId, view: 'initiatives', active: activeView === 'initiatives' });
  }

  if (drillDown.initiativeId && activeView === 'delivery') {
    crumbs.push({ label: drillDown.initiativeTitle || drillDown.initiativeId, view: 'delivery', active: true });
  }

  // For metrics/monitor, just show the view name
  if (activeView === 'metrics') {
    return (
      <div className="px-4 py-2 border-b border-mc-border bg-mc-bg-secondary/50 flex items-center gap-2 text-sm">
        <button onClick={() => onNavigate('queue')} className="text-mc-text-secondary hover:text-mc-accent transition-colors">
          <Home className="w-4 h-4" />
        </button>
        <ChevronRight className="w-3 h-3 text-mc-text-secondary" />
        <span className="text-mc-text font-medium">Metrics Dashboard</span>
      </div>
    );
  }

  if (activeView === 'monitor') {
    return (
      <div className="px-4 py-2 border-b border-mc-border bg-mc-bg-secondary/50 flex items-center gap-2 text-sm">
        <button onClick={() => onNavigate('queue')} className="text-mc-text-secondary hover:text-mc-accent transition-colors">
          <Home className="w-4 h-4" />
        </button>
        <ChevronRight className="w-3 h-3 text-mc-text-secondary" />
        <span className="text-mc-text font-medium">Monitor</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-b border-mc-border bg-mc-bg-secondary/50 flex items-center gap-2 text-sm overflow-x-auto">
      <button onClick={() => onNavigate('queue')} className="text-mc-text-secondary hover:text-mc-accent transition-colors flex-shrink-0">
        <Home className="w-4 h-4" />
      </button>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-2 flex-shrink-0">
          <ChevronRight className="w-3 h-3 text-mc-text-secondary" />
          {crumb.active ? (
            <span className="text-mc-text font-medium">{crumb.label}</span>
          ) : (
            <button
              onClick={() => onNavigate(crumb.view)}
              className="text-mc-accent hover:text-mc-accent/80 transition-colors"
            >
              {crumb.label}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
