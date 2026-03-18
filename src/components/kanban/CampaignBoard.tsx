'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Megaphone } from 'lucide-react';
import type { KanbanStage } from '@/lib/types/kanban';

interface CampaignRow {
  id: string;
  goal_id: string;
  title: string;
  description?: string;
  domain: string;
  stage: string;
  priority: number;
  progress_pct: number;
  meta_type: string;
  owner_id?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  initiative_count: number;
  task_count: number;
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

interface CampaignBoardProps {
  businessId: string;
  goalId?: string;
  onDrillDown: (campaignId: string, campaignTitle: string) => void;
}

export function CampaignBoard({ businessId, goalId, onDrillDown }: CampaignBoardProps) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [compactEmpty, setCompactEmpty] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        let url = `/api/kanban/campaigns?`;
        if (goalId) url += `goalId=${goalId}&`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns || []);
        }
      } catch (err) {
        console.error('Failed to load campaigns:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessId, goalId]);

  const getCampaignsByStage = (stage: KanbanStage) => campaigns.filter(c => c.stage === stage);

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
          <Megaphone className="w-4 h-4 text-mc-accent-pink" />
          <span className="text-sm font-medium uppercase tracking-wider">Campaigns</span>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{campaigns.length}</span>
        </div>
      </div>

      <div className="mission-queue-scroll-x flex-1 flex gap-3 p-3 overflow-x-auto">
        {COLUMNS.map(column => {
          const columnItems = getCampaignsByStage(column.id);
          const hasItems = columnItems.length > 0;
          return (
            <div
              key={column.id}
              style={{ width: getColumnWidth(columnItems.length) }}
              className={`flex-none ${compactEmpty ? (hasItems ? 'min-w-[240px]' : 'min-w-[110px] max-w-[180px]') : 'min-w-[250px] max-w-[320px]'} flex flex-col bg-mc-bg rounded-lg border border-mc-border/50 border-t-2 transition-[width] duration-200 ${column.color}`}
            >
              <div className="p-2 border-b border-mc-border flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase text-mc-text-secondary whitespace-nowrap">{column.label}</span>
                <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{columnItems.length}</span>
              </div>
              <div className={`flex-1 overflow-y-auto p-2 ${hasItems ? 'space-y-2' : ''}`}>
                {columnItems.map(campaign => (
                  <CampaignCard key={campaign.id} campaign={campaign} onClick={() => onDrillDown(campaign.id, campaign.title)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampaignCard({ campaign, onClick }: { campaign: CampaignRow; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-mc-bg-secondary border border-mc-border/50 rounded-lg p-3 cursor-pointer hover:border-mc-accent/40 hover:shadow-lg hover:shadow-black/20 transition-all"
    >
      <h4 className="text-sm font-medium leading-snug line-clamp-2 mb-2">{campaign.title}</h4>

      <div className="flex items-center gap-1.5 mb-2">
        <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${DOMAIN_COLORS[campaign.domain] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
          {campaign.domain}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-mc-accent-pink rounded-full transition-all duration-500"
            style={{ width: `${Math.max(campaign.progress_pct, 1)}%` }}
          />
        </div>
        <div className="text-[10px] text-mc-text-secondary mt-0.5">{campaign.progress_pct}% complete</div>
      </div>

      {/* Date range */}
      {(campaign.start_date || campaign.end_date) && (
        <div className="text-[10px] text-mc-text-secondary mb-2">
          {campaign.start_date && new Date(campaign.start_date).toLocaleDateString()}
          {campaign.start_date && campaign.end_date && ' - '}
          {campaign.end_date && new Date(campaign.end_date).toLocaleDateString()}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-mc-text-secondary pt-2 border-t border-mc-border/20">
        <span>{campaign.initiative_count} initiatives</span>
        <span>{campaign.task_count} tasks</span>
      </div>
    </div>
  );
}
