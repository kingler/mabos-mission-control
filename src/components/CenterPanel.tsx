'use client';

import { GoalAncestry, type WorkspaceView, type DrillDownState } from './kanban/GoalAncestry';
import { GoalBoard } from './kanban/GoalBoard';
import { CampaignBoard } from './kanban/CampaignBoard';
import { InitiativeBoard } from './kanban/InitiativeBoard';
import { MonitorDashboard } from './kanban/MonitorDashboard';
import { MissionQueue } from './MissionQueue';
import MetricsDashboard from './mabos/MetricsDashboard';
import { GraphView } from './graph/GraphView';

interface CenterPanelProps {
  activeView: WorkspaceView;
  workspaceId: string;
  businessId: string;
  drillDown: DrillDownState;
  onDrillDown: (view: WorkspaceView, id: string, title: string) => void;
  onDrillUp: (view: WorkspaceView) => void;
  mobileMode?: boolean;
  isPortrait?: boolean;
}

export function CenterPanel({
  activeView,
  workspaceId,
  businessId,
  drillDown,
  onDrillDown,
  onDrillUp,
  mobileMode = false,
  isPortrait = true,
}: CenterPanelProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {activeView !== 'queue' && (
        <GoalAncestry drillDown={drillDown} onNavigate={onDrillUp} activeView={activeView} />
      )}

      {activeView === 'queue' && (
        <MissionQueue workspaceId={workspaceId} mobileMode={mobileMode} isPortrait={isPortrait} />
      )}

      {activeView === 'goals' && (
        <GoalBoard
          businessId={businessId}
          onDrillDown={(goalId, goalTitle) => onDrillDown('campaigns', goalId, goalTitle)}
        />
      )}

      {activeView === 'campaigns' && (
        <CampaignBoard
          businessId={businessId}
          goalId={drillDown.goalId}
          onDrillDown={(campaignId, campaignTitle) => onDrillDown('initiatives', campaignId, campaignTitle)}
        />
      )}

      {activeView === 'initiatives' && (
        <InitiativeBoard
          businessId={businessId}
          campaignId={drillDown.campaignId}
          onDrillDown={(initiativeId, initiativeTitle) => onDrillDown('delivery', initiativeId, initiativeTitle)}
        />
      )}

      {activeView === 'delivery' && (
        <MissionQueue
          workspaceId={workspaceId}
          initiativeFilter={drillDown.initiativeId}
          mobileMode={mobileMode}
          isPortrait={isPortrait}
        />
      )}

      {activeView === 'metrics' && (
        <div className="flex-1 overflow-y-auto p-4">
          <MetricsDashboard />
        </div>
      )}

      {activeView === 'monitor' && <MonitorDashboard />}

      {activeView === 'graph' && <GraphView businessId={businessId} />}
    </div>
  );
}
