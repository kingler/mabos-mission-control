'use client';

import { X } from 'lucide-react';
import type { GraphNode, GraphLink } from '@/types/graph';

const TYPE_COLORS: Record<string, string> = {
  agent: '#3b82f6',
  goal: '#22c55e',
  plan: '#a855f7',
  task: '#f59e0b',
  campaign: '#ec4899',
  initiative: '#06b6d4',
};

interface GraphNodeDetailProps {
  node: GraphNode;
  links: GraphLink[];
  nodes: GraphNode[];
  onClose: () => void;
}

export function GraphNodeDetail({ node, links, nodes, onClose }: GraphNodeDetailProps) {
  const connected = links
    .filter((l) => {
      const src = typeof l.source === 'object' ? (l.source as { id: string }).id : l.source;
      const tgt = typeof l.target === 'object' ? (l.target as { id: string }).id : l.target;
      return src === node.id || tgt === node.id;
    })
    .map((l) => {
      const src = typeof l.source === 'object' ? (l.source as { id: string }).id : l.source;
      const tgt = typeof l.target === 'object' ? (l.target as { id: string }).id : l.target;
      const otherId = src === node.id ? tgt : src;
      const other = nodes.find((n) => n.id === otherId);
      return { relation: l.relation, node: other, direction: src === node.id ? 'out' : 'in' };
    })
    .filter((c) => c.node);

  return (
    <div className="absolute top-4 right-4 z-10 bg-zinc-900/95 border border-zinc-800 rounded-lg w-72 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: TYPE_COLORS[node.type] || '#666' }}
          />
          <span className="text-xs uppercase tracking-wider text-zinc-400">{node.type}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <div className="text-sm font-medium text-zinc-100 leading-snug">{node.label}</div>
          <div className="text-xs text-zinc-500 mt-0.5 font-mono">{node.id}</div>
        </div>

        {node.status && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Status:</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{node.status}</span>
          </div>
        )}

        {node.agent && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Agent:</span>
            <span className="text-xs text-zinc-300 font-mono">{node.agent}</span>
          </div>
        )}

        {node.tier !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Tier:</span>
            <span className="text-xs text-zinc-300">{node.tier}</span>
          </div>
        )}

        {connected.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
              Connections ({connected.length})
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {connected.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[c.node!.type] || '#666' }}
                  />
                  <span className="text-zinc-500">{c.direction === 'out' ? '\u2192' : '\u2190'}</span>
                  <span className="text-zinc-300 truncate">{c.node!.label}</span>
                  <span className="text-zinc-600 text-[10px] ml-auto flex-shrink-0">{c.relation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
