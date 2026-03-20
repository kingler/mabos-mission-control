'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { GraphNode, GraphLink, GraphData, GraphFilters } from '@/types/graph';
import { GraphFilterPanel } from './GraphFilterPanel';
import { GraphNodeDetail } from './GraphNodeDetail';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const TYPE_COLORS: Record<string, string> = {
  agent: '#3b82f6',
  goal: '#22c55e',
  plan: '#a855f7',
  task: '#f59e0b',
  campaign: '#ec4899',
  initiative: '#06b6d4',
};

const TYPE_FILTER_MAP: Record<string, keyof GraphFilters> = {
  agent: 'showAgents',
  goal: 'showGoals',
  plan: 'showPlans',
  task: 'showTasks',
  campaign: 'showCampaigns',
  initiative: 'showInitiatives',
};

// Node radius by type (smaller to reduce clutter)
const NODE_RADIUS: Record<string, number> = {
  agent: 6,
  goal: 4,
  campaign: 3.5,
  initiative: 3,
  task: 2,
  plan: 3,
};

interface GraphViewProps {
  businessId: string;
}

export function GraphView({ businessId }: GraphViewProps) {
  const [rawData, setRawData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [filters, setFilters] = useState<GraphFilters>({
    showAgents: true,
    showGoals: true,
    showPlans: true,
    showTasks: true,
    showCampaigns: true,
    showInitiatives: true,
    selectedAgent: null,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ businessId });
      if (filters.selectedAgent) params.set('agent', filters.selectedAgent);
      const res = await fetch(`/api/kanban/graph?${params}`);
      if (res.ok) {
        const data: GraphData = await res.json();
        setRawData(data);
      }
    } catch (err) {
      console.error('[GraphView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId, filters.selectedAgent]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Configure d3 forces for maximum spacing
  const configureForces = useCallback(() => {
    const fg = graphRef.current;
    if (!fg) return;
    try {
      fg.d3Force('charge')?.strength(-2000)?.distanceMax(2000);
      fg.d3Force('link')?.distance(200).strength(0.3);
      fg.d3Force('center')?.strength(0.02);
      fg.d3ReheatSimulation();
    } catch {
      // forces not ready yet
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(configureForces, 500);
    return () => clearTimeout(timer);
  }, [configureForces, rawData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const filteredData = useMemo(() => {
    const visibleNodes = rawData.nodes.filter((n) => {
      const filterKey = TYPE_FILTER_MAP[n.type];
      return filterKey ? (filters[filterKey] as boolean) : true;
    });
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleLinks = rawData.links.filter((l) => {
      const src = typeof l.source === 'object' ? (l.source as { id: string }).id : l.source;
      const tgt = typeof l.target === 'object' ? (l.target as { id: string }).id : l.target;
      return visibleIds.has(src) && visibleIds.has(tgt);
    });
    return { nodes: visibleNodes, links: visibleLinks };
  }, [rawData, filters]);

  const highlightIds = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const ids = new Set<string>([hoveredNode.id]);
    for (const l of rawData.links) {
      const src = typeof l.source === 'object' ? (l.source as { id: string }).id : l.source;
      const tgt = typeof l.target === 'object' ? (l.target as { id: string }).id : l.target;
      if (src === hoveredNode.id) ids.add(tgt);
      if (tgt === hoveredNode.id) ids.add(src);
    }
    return ids;
  }, [hoveredNode, rawData.links]);

  const agentOptions = useMemo(
    () => rawData.nodes.filter((n) => n.type === 'agent').map((n) => ({ id: n.id, label: n.label })),
    [rawData.nodes]
  );

  const nodeCanvasObject = useCallback(
    (node: GraphNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = NODE_RADIUS[node.type] || 3;
      const color = TYPE_COLORS[node.type] || '#666';
      const dimmed = hoveredNode && !highlightIds.has(node.id);
      const isHovered = hoveredNode?.id === node.id;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = dimmed ? color + '33' : color;
      ctx.fill();

      // Selection ring
      if (selectedNode?.id === node.id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Hover ring
      if (isHovered) {
        ctx.strokeStyle = '#ffffffaa';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Labels: show only when zoomed in, or for hovered/selected nodes
      const showLabel =
        globalScale > 4 ||
        isHovered ||
        selectedNode?.id === node.id ||
        (node.type === 'agent' && globalScale > 2) ||
        (highlightIds.has(node.id) && globalScale > 1.5);

      if (showLabel) {
        const label = node.label.length > 24 ? node.label.slice(0, 22) + '\u2026' : node.label;
        const fontSize = Math.max(10 / globalScale, 2);
        ctx.font = `${node.type === 'agent' ? 'bold ' : ''}${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = dimmed ? '#ffffff33' : '#ffffffcc';
        ctx.fillText(label, x, y + r + 2 / globalScale);
      }
    },
    [hoveredNode, highlightIds, selectedNode]
  );

  const linkColor = useCallback(
    (link: GraphLink) => {
      if (!hoveredNode) return '#ffffff15';
      const src = typeof link.source === 'object' ? (link.source as { id: string }).id : link.source;
      const tgt = typeof link.target === 'object' ? (link.target as { id: string }).id : link.target;
      return highlightIds.has(src) && highlightIds.has(tgt) ? '#ffffff55' : '#ffffff08';
    },
    [hoveredNode, highlightIds]
  );

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-zinc-500 text-sm">Loading graph\u2026</div>
        </div>
      )}

      <GraphFilterPanel filters={filters} onFilterChange={setFilters} agents={agentOptions} />

      {selectedNode && (
        <GraphNodeDetail
          node={selectedNode}
          links={rawData.links}
          nodes={rawData.nodes}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Stats badge */}
      <div className="absolute bottom-4 left-4 z-10 bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-500">
        {filteredData.nodes.length} nodes &middot; {filteredData.links.length} edges
      </div>

      {!loading && (
        <ForceGraph2D
          ref={((el: unknown) => { graphRef.current = el; if (el) setTimeout(configureForces, 300); }) as unknown as React.MutableRefObject<undefined>}
          width={dimensions.width}
          height={dimensions.height}
          graphData={filteredData}
          nodeCanvasObject={nodeCanvasObject as unknown as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
          nodePointerAreaPaint={((node: GraphNode & { x?: number; y?: number }, color: string, ctx: CanvasRenderingContext2D) => {
            const r = NODE_RADIUS[node.type] || 3;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, r + 1, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }) as unknown as (node: object, color: string, ctx: CanvasRenderingContext2D) => void}
          linkColor={linkColor as unknown as (link: object) => string}
          linkWidth={0.5}
          onNodeClick={(node: object) => setSelectedNode(node as GraphNode)}
          onNodeHover={(node: object | null) => setHoveredNode(node as GraphNode | null)}
          onBackgroundClick={() => setSelectedNode(null)}
          backgroundColor="#0a0a0a"
          cooldownTicks={300}
          warmupTicks={50}
          nodeRelSize={1}
          linkDirectionalParticles={0}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePointerInteraction={true}
          d3AlphaDecay={0.01}
          d3VelocityDecay={0.2}
        />
      )}
    </div>
  );
}
