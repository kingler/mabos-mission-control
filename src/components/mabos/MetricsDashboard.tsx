'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  Clock,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────

interface GoalRollup {
  id: string;
  title: string;
  stage: string;
  progress_pct: number;
  domain: string;
  campaigns: number;
  initiatives: number;
  tasks: number;
  done_tasks: number;
}

interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  entity: string;
  entityId: string;
  message: string;
  detectedAt: string;
}

interface AgentActivity {
  agent_id: string;
  cnt: number;
}

interface StageTransition {
  id: string;
  entity_type: string;
  entity_id: string;
  from_stage: string;
  to_stage: string;
  changed_by: string;
  created_at: string;
}

interface RollupData {
  goals: GoalRollup[];
  bdi_summary_24h: Record<string, number>;
  agent_activity_24h: AgentActivity[];
  recent_transitions: StageTransition[];
}

interface AnomalyData {
  anomalies: Anomaly[];
  count: number;
  scanned_at: string;
  checks: string[];
}

// ─── Constants ────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  product: 'bg-mc-accent/20 text-mc-accent',
  marketing: 'bg-mc-accent-pink/20 text-mc-accent-pink',
  operations: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
  finance: 'bg-mc-accent-green/20 text-mc-accent-green',
  technology: 'bg-mc-accent-purple/20 text-mc-accent-purple',
};

const SEVERITY_STYLES: Record<string, { bg: string; icon: string; border: string }> = {
  high: { bg: 'bg-mc-accent-red/10', icon: 'text-mc-accent-red', border: 'border-mc-accent-red/30' },
  medium: { bg: 'bg-mc-accent-yellow/10', icon: 'text-mc-accent-yellow', border: 'border-mc-accent-yellow/30' },
  low: { bg: 'bg-mc-bg-tertiary', icon: 'text-mc-text-secondary', border: 'border-mc-border' },
};

const BDI_STATE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  belief: { label: 'Beliefs', color: 'bg-mc-accent', icon: '🧠' },
  desire: { label: 'Desires', color: 'bg-mc-accent-yellow', icon: '🎯' },
  intention: { label: 'Intentions', color: 'bg-mc-accent-green', icon: '⚡' },
};

// ─── Component ────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const [rollup, setRollup] = useState<RollupData | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rollupRes, anomalyRes] = await Promise.all([
        fetch('/api/kanban/rollup'),
        fetch('/api/kanban/anomalies'),
      ]);
      const rollupData = await rollupRes.json();
      const anomalyData = await anomalyRes.json();
      setRollup(rollupData);
      setAnomalies(anomalyData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const triggerRollup = async () => {
    try {
      await fetch('/api/kanban/rollup', { method: 'POST' });
      await fetchData();
    } catch (err) {
      console.error('Rollup failed:', err);
    }
  };

  if (loading && !rollup) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-mc-accent animate-spin" />
      </div>
    );
  }

  const goals = rollup?.goals ?? [];
  const bdiSummary = rollup?.bdi_summary_24h ?? {};
  const agentActivity = rollup?.agent_activity_24h ?? [];
  const transitions = rollup?.recent_transitions ?? [];
  const anomalyList = anomalies?.anomalies ?? [];

  const totalBdi = Object.values(bdiSummary).reduce((a, b) => a + b, 0);
  const activeGoals = goals.filter(g => g.stage === 'in_progress').length;
  const avgProgress = goals.length > 0
    ? Math.round(goals.reduce((a, g) => a + g.progress_pct, 0) / goals.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-mc-accent" />
          <h2 className="text-xl font-bold text-mc-text">Metrics Dashboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-mc-text-secondary">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={triggerRollup}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-mc-accent/10 text-mc-accent rounded-lg hover:bg-mc-accent/20 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Recalculate
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Active Goals"
          value={activeGoals}
          sub={`${goals.length} total`}
          color="text-mc-accent"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Avg Progress"
          value={`${avgProgress}%`}
          sub="across all goals"
          color="text-mc-accent-green"
        />
        <StatCard
          icon={<Brain className="w-5 h-5" />}
          label="BDI Events (24h)"
          value={totalBdi}
          sub={`${agentActivity.length} agents active`}
          color="text-mc-accent-purple"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Anomalies"
          value={anomalyList.length}
          sub={anomalyList.length === 0 ? 'All clear' : `${anomalyList.filter(a => a.severity === 'high').length} high`}
          color={anomalyList.length > 0 ? 'text-mc-accent-red' : 'text-mc-accent-green'}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goal Progress */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-mc-accent" />
            Goal Progress
          </h3>
          <div className="space-y-3">
            {goals.map(goal => (
              <div key={goal.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-mc-text truncate max-w-[200px]">{goal.title}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${DOMAIN_COLORS[goal.domain] || 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                      {goal.domain}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-mc-text-secondary">{goal.progress_pct}%</span>
                </div>
                <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-mc-accent rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(goal.progress_pct, 1)}%` }}
                  />
                </div>
                <div className="flex gap-3 text-[10px] text-mc-text-secondary">
                  <span>{goal.campaigns} campaigns</span>
                  <span>{goal.initiatives} initiatives</span>
                  <span>{goal.done_tasks}/{goal.tasks} tasks done</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BDI Activity */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-mc-accent-purple" />
            BDI Activity (24h)
          </h3>

          {/* BDI State Bars */}
          <div className="space-y-3 mb-5">
            {Object.entries(BDI_STATE_CONFIG).map(([state, config]) => {
              const count = bdiSummary[state] ?? 0;
              const pct = totalBdi > 0 ? (count / totalBdi) * 100 : 0;
              return (
                <div key={state} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-mc-text-secondary">
                      {config.icon} {config.label}
                    </span>
                    <span className="font-mono text-mc-text">{count}</span>
                  </div>
                  <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full ${config.color} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Agent Leaderboard */}
          <h4 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2">
            Agent Activity
          </h4>
          <div className="space-y-1.5">
            {agentActivity.slice(0, 6).map((agent, i) => (
              <div key={agent.agent_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs text-mc-text-secondary">{i + 1}</span>
                  <span className="text-mc-text font-mono">{agent.agent_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-mc-accent-purple rounded-full"
                      style={{
                        width: `${agentActivity.length > 0 ? (agent.cnt / agentActivity[0].cnt) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-mc-text-secondary w-8 text-right">{agent.cnt}</span>
                </div>
              </div>
            ))}
            {agentActivity.length === 0 && (
              <p className="text-sm text-mc-text-secondary italic">No agent activity in the last 24h</p>
            )}
          </div>
        </div>
      </div>

      {/* Anomalies */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-mc-accent-yellow" />
          Anomaly Detection
          <span className="text-[10px] bg-mc-bg-tertiary text-mc-text-secondary px-2 py-0.5 rounded-full">
            {anomalies?.checks.length ?? 0} checks
          </span>
        </h3>

        {anomalyList.length === 0 ? (
          <div className="flex items-center gap-3 p-4 bg-mc-accent-green/5 border border-mc-accent-green/20 rounded-lg">
            <Zap className="w-5 h-5 text-mc-accent-green" />
            <div>
              <p className="text-sm text-mc-accent-green font-medium">All systems nominal</p>
              <p className="text-xs text-mc-text-secondary">
                No anomalies detected. Last scan: {anomalies?.scanned_at ? new Date(anomalies.scanned_at).toLocaleTimeString() : 'N/A'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {anomalyList.map((anomaly, i) => {
              const style = SEVERITY_STYLES[anomaly.severity];
              return (
                <div key={i} className={`flex items-start gap-3 p-3 ${style.bg} border ${style.border} rounded-lg`}>
                  <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${style.icon}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-mc-text-secondary uppercase">{anomaly.type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        anomaly.severity === 'high' ? 'bg-mc-accent-red/20 text-mc-accent-red' :
                        anomaly.severity === 'medium' ? 'bg-mc-accent-yellow/20 text-mc-accent-yellow' :
                        'bg-mc-bg-tertiary text-mc-text-secondary'
                      }`}>
                        {anomaly.severity}
                      </span>
                    </div>
                    <p className="text-sm text-mc-text">{anomaly.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Stage Transitions */}
      <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-mc-text mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-mc-accent-cyan" />
          Recent Stage Transitions
        </h3>
        {transitions.length === 0 ? (
          <p className="text-sm text-mc-text-secondary italic">No stage transitions recorded yet</p>
        ) : (
          <div className="space-y-2">
            {transitions.map(t => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-mc-text-secondary font-mono w-16">
                  {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-mc-text-secondary">{t.entity_type}</span>
                <span className="text-mc-accent-red px-1.5 py-0.5 bg-mc-accent-red/10 rounded text-xs">
                  {t.from_stage}
                </span>
                <span className="text-mc-text-secondary">→</span>
                <span className="text-mc-accent-green px-1.5 py-0.5 bg-mc-accent-green/10 rounded text-xs">
                  {t.to_stage}
                </span>
                <span className="text-mc-text-secondary text-xs">by {t.changed_by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-mc-text">{value}</p>
      <p className="text-sm text-mc-text-secondary">{label}</p>
      <p className="text-xs text-mc-text-secondary mt-1">{sub}</p>
    </div>
  );
}
