'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Brain, RefreshCw, Users } from 'lucide-react';

interface MabosAgentRow {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
  status: string;
  agent_type: string;
  autonomy_level: string;
  parent_agent_id: string | null;
  belief_count: number;
  goal_count: number;
  intention_count: number;
  desire_count: number;
  gateway_agent_id: string;
  bdi_synced_at: string | null;
}

interface AgentHierarchyProps {
  onSelectAgent?: (agent: MabosAgentRow) => void;
}

export function AgentHierarchy({ onSelectAgent }: AgentHierarchyProps) {
  const [agents, setAgents] = useState<MabosAgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [triggeringBdi, setTriggeringBdi] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/mabos/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
        // Expand all by default
        setExpandedNodes(new Set(data.map((a: MabosAgentRow) => a.id)));
      }
    } catch (err) {
      console.error('Failed to load MABOS agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mabos/agents/import', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents);
        setExpandedNodes(new Set(data.agents.map((a: MabosAgentRow) => a.id)));
      }
    } catch (err) {
      console.error('Failed to import agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerBdi = async (agent: MabosAgentRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setTriggeringBdi(agent.id);
    try {
      await fetch(`/api/mabos/agents/${agent.id}/bdi`, { method: 'POST' });
      // Refresh agent data after BDI cycle
      await loadAgents();
    } catch (err) {
      console.error('BDI trigger failed:', err);
    } finally {
      setTriggeringBdi(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rootAgents = agents.filter(a => !a.parent_agent_id);
  const childrenOf = (parentId: string) => agents.filter(a => a.parent_agent_id === parentId);

  const renderAgent = (agent: MabosAgentRow, depth: number = 0) => {
    const children = childrenOf(agent.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(agent.id);

    return (
      <div key={agent.id}>
        <div
          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-mc-bg-tertiary transition-colors ${depth > 0 ? 'ml-6' : ''}`}
          onClick={() => onSelectAgent?.(agent)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(agent.id); }} className="p-0.5">
              {isExpanded ? <ChevronDown className="w-4 h-4 text-mc-text-secondary" /> : <ChevronRight className="w-4 h-4 text-mc-text-secondary" />}
            </button>
          ) : (
            <div className="w-5" />
          )}

          <span className="text-xl">{agent.avatar_emoji}</span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{agent.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">MABOS</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">{agent.agent_type}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-mc-text-secondary mt-0.5">
              <span title="Beliefs">B:{agent.belief_count}</span>
              <span title="Desires">D:{agent.desire_count}</span>
              <span title="Goals">G:{agent.goal_count}</span>
              <span title="Intentions">I:{agent.intention_count}</span>
            </div>
          </div>

          <button
            onClick={(e) => handleTriggerBdi(agent, e)}
            disabled={triggeringBdi === agent.id}
            className="p-1.5 rounded hover:bg-purple-500/20 text-mc-text-secondary hover:text-purple-400 transition-colors"
            title="Trigger BDI Cycle"
          >
            <Brain className={`w-4 h-4 ${triggeringBdi === agent.id ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-mc-border/30 ml-4">
            {children.map(child => renderAgent(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-mc-accent" />
          <h2 className="text-lg font-semibold">MABOS Agents</h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{agents.length}</span>
        </div>
        <button
          onClick={handleImport}
          className="flex items-center gap-2 px-3 min-h-9 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded text-sm text-green-400"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-mc-text-secondary mb-4">No MABOS agents imported yet.</p>
          <button
            onClick={handleImport}
            className="px-4 py-2 bg-mc-accent text-mc-bg rounded-lg text-sm font-medium"
          >
            Import from MABOS
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {rootAgents.map(agent => renderAgent(agent))}
        </div>
      )}
    </div>
  );
}
