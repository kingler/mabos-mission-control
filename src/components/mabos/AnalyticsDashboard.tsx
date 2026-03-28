'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Facebook,
  Instagram,
  Mail,
  MousePointerClick,
  Eye,
  Users,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  Bookmark,
  ExternalLink,
  Heart,
  MessageCircle,
  Send,
  ShieldCheck,
  UserPlus,
  Loader2,
  DollarSign,
  Cpu,
  ShoppingBag,
  Package,
  CreditCard,
  Zap,
  Bot,
  Store,
  Video,
  Globe,
  Activity,
  Timer,
  Target,
} from 'lucide-react';
import WorldMap from 'react-svg-worldmap';

// ─── Types ────────────────────────────────────────────────────────────

interface MetricSeries {
  total: number;
  daily: { date: string; value: number }[];
}

interface FacebookData {
  configured: boolean;
  error?: string | null;
  page?: { name: string; fans: number; followers: number } | null;
  metrics?: Record<string, MetricSeries> | null;
  period?: string;
}

interface InstagramData {
  configured: boolean;
  error?: string | null;
  metrics?: Record<string, MetricSeries> | null;
  recentPosts?: { id: string; caption: string; date: string; likes: number; comments: number; type: string; url: string }[];
  period?: string;
}

interface PinterestData {
  configured: boolean;
  error?: string | null;
  totals?: Record<string, number> | null;
  daily?: { date: string; impressions: number; clicks: number; saves: number }[];
  recentPins?: { id: string; title: string; date: string; link: string }[];
  period?: string;
}

interface SendGridData {
  configured: boolean;
  error?: string | null;
  summary?: {
    totalContacts: number; totalSent: number; totalDelivered: number;
    totalOpens: number; totalClicks: number; totalBounces: number;
    totalBlocks: number; totalSpam: number; totalUnsubscribes: number;
    deliveryRate: string; openRate: string; clickRate: string;
  };
  lists?: { id: string; name: string; contact_count: number }[];
  daily?: { date: string; delivered: number; opens: number; clicks: number }[];
  credits?: { remain: number; total: number; used: number; nextReset: string } | null;
  period?: string;
}

interface ShopifyData {
  configured: boolean;
  error?: string | null;
  shop?: { name: string; plan: string; currency: string; domain: string };
  summary?: {
    totalRevenue: number; paidRevenue: number; totalOrders: number;
    paidOrders: number; aov: number; productCount: number;
  };
  monthlyRevenue?: { month: string; revenue: number }[];
  recentOrders?: {
    name: string; date: string; status: string; fulfillment: string;
    total: number; currency: string;
    items: { title: string; quantity: number }[];
  }[];
}

interface TokenCostsData {
  configured: boolean;
  error?: string | null;
  summary?: {
    totalInputTokens: number; totalOutputTokens: number;
    totalCacheReadTokens: number; totalCacheWriteTokens: number;
    totalTokens: number; totalCost: number; totalCalls: number;
  };
  byModel?: { model: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; cost: number }[];
  byAgent?: { agent: string; calls: number; inputTokens: number; outputTokens: number; cost: number }[];
  byProvider?: { provider: string; calls: number; inputTokens: number; outputTokens: number; estimatedCost: number; billing: string }[];
}

interface ApolloData {
  configured: boolean;
  error?: string | null;
  summary?: {
    totalEnriched: number; totalNew: number; totalDupes: number;
    totalNoEmail: number; totalLeads: number; totalPulls: number;
    creditsUsed: number; monthlyCredits: number;
  };
  pulls?: { date: string; enriched: number; newLeads: number; personas: number }[];
}

interface GoogleAnalyticsData {
  configured: boolean;
  error?: string | null;
  summary?: {
    totalSessions: number; totalUsers: number; totalNewUsers: number;
    totalPageViews: number; avgBounceRate: number; avgDuration: number;
  };
  dailySessions?: { date: string; value: number }[];
  topPages?: { path: string; pageViews: number; sessions: number }[];
  period?: string;
}

interface ShopifyAnalyticsData {
  configured: boolean;
  error?: string | null;
  summary?: {
    totalSessions: number;
    totalPageviews: number;
    totalVisitors: number;
  };
  dailySessions?: { date: string; sessions: number; pageviews: number; visitors: number }[];
  byCountry?: { country: string; countryCode: string; sessions: number; visitors: number; revenue?: number }[];
  period?: string;
}

interface GoogleAdsData {
  configured: boolean;
  error?: string | null;
  spend: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cpc?: number;
  dailySpend?: { date: string; value: number }[];
  hasData?: boolean;
  period?: string;
}

interface TikTokData {
  configured: boolean;
  error?: string | null;
  spend: number;
  impressions?: number;
  clicks?: number;
  reach?: number;
  videoPlays?: number;
  videoWatched2s?: number;
  videoWatched6s?: number;
  conversions?: number;
  dailySpend?: { date: string; value: number }[];
  hasData?: boolean;
  period?: string;
}

interface MetaAdsData {
  configured: boolean;
  error?: string | null;
  spend: number;
  impressions?: number;
  clicks?: number;
  reach?: number;
  cpc?: number;
  cpm?: number;
  hasData?: boolean;
}

interface StripeData {
  configured: boolean;
  error?: string | null;
  totalRevenue?: number;
  totalTransactions?: number;
  successCount?: number;
  successRate?: number;
  refundRate?: number;
  totalRefunded?: number;
  averageOrderValue?: number;
  balance?: number;
  recentCharges?: { amount: number; currency: string; created: number; status: string; description: string }[];
  period?: string;
}

interface CostSummary {
  llmEstimated: number;
  llmActual: number;
  operatorEstimated: number;
  adSpend: number;
  fixedMonthly: number;
  fixedBreakdown: { id: string; name: string; monthly: number }[];
  totalMonthly: number;
}

interface AnalyticsResponse {
  facebook: FacebookData;
  instagram: InstagramData;
  pinterest: PinterestData;
  sendgrid: SendGridData;
  shopify: ShopifyData;
  tokenCosts: TokenCostsData;
  metaAds: MetaAdsData;
  googleAnalytics: GoogleAnalyticsData;
  shopifyAnalytics: ShopifyAnalyticsData;
  googleAds: GoogleAdsData;
  tiktok: TikTokData;
  stripe: StripeData;
  apollo: ApolloData;
  costs: CostSummary;
  fetchedAt: string;
}

// ─── Tab Types ────────────────────────────────────────────────────────

type AnalyticsTab = 'overview' | 'social' | 'advertising' | 'email' | 'web' | 'revenue';

const TABS: { id: AnalyticsTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'social', label: 'Social Media', icon: Users },
  { id: 'advertising', label: 'Advertising', icon: Target },
  { id: 'email', label: 'Email & Outreach', icon: Mail },
  { id: 'web', label: 'Web Analytics', icon: Globe },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
];

// ─── Sparkline ────────────────────────────────────────────────────────

function Sparkline({ data, color = '#58a6ff', height = 32 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 120;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 4)}`).join(' ');
  return (
    <svg width={w} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color = 'text-mc-accent', sparkData, sparkColor, sub,
}: {
  label: string; value: string | number; icon: any; color?: string;
  sparkData?: number[]; sparkColor?: string; sub?: string;
}) {
  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-mc-text-secondary text-xs uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-mc-text">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} color={sparkColor} />}
      {sub && <span className="text-xs text-mc-text-secondary">{sub}</span>}
    </div>
  );
}

// ─── Platform Section ─────────────────────────────────────────────────

function PlatformSection({
  title, icon: Icon, iconColor, configured, error, children,
}: {
  title: string; icon: any; iconColor: string; configured: boolean;
  error?: string | null; children: React.ReactNode;
}) {
  if (!configured) {
    return (
      <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          <h2 className="text-lg font-bold text-mc-text">{title}</h2>
        </div>
        <div className="flex items-center gap-2 text-mc-text-secondary text-sm">
          <AlertTriangle className="w-4 h-4 text-mc-accent-yellow" />
          <span>Not configured. Set API credentials in <code className="text-mc-accent">.env</code></span>
        </div>
      </section>
    );
  }
  return (
    <section className="bg-mc-bg-secondary border border-mc-border rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <h2 className="text-lg font-bold text-mc-text">{title}</h2>
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-2 text-mc-accent-red text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────

function MiniBarChart({ data, color = '#58a6ff', height = 48 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(4, Math.min(12, 300 / data.length - 2));
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.label}: ${d.value.toLocaleString()}`}
          className="rounded-t-sm transition-all hover:opacity-80"
          style={{
            width: barW,
            height: Math.max(2, (d.value / max) * height),
            backgroundColor: color,
            opacity: 0.7 + (d.value / max) * 0.3,
          }}
        />
      ))}
    </div>
  );
}

// ─── Cost Bar (horizontal) ────────────────────────────────────────────

function CostBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <div className="text-mc-text-secondary text-sm">No costs recorded</div>;
  return (
    <div className="space-y-2">
      <div className="flex h-6 rounded-md overflow-hidden">
        {items.filter(i => i.value > 0).map((item, idx) => (
          <div
            key={idx}
            title={`${item.label}: $${item.value.toFixed(2)}`}
            className="transition-all hover:opacity-80"
            style={{
              width: `${(item.value / total) * 100}%`,
              backgroundColor: item.color,
              minWidth: item.value > 0 ? '2px' : '0',
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {items.filter(i => i.value > 0).map((item, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-mc-text-secondary">{item.label}</span>
            <span className="text-mc-text font-mono">${item.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────

function fmtUSD(n: number) { return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtTokens(n: number) { return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toString(); }

// ─── Main Component ───────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-mc-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading analytics...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-mc-accent-red">
        <AlertTriangle className="w-5 h-5 mr-2" />
        Failed to load analytics: {error}
      </div>
    );
  }

  if (!data) return null;

  const { facebook: fb, instagram: ig, pinterest: pin, sendgrid: sg, shopify: shop, tokenCosts: tc, metaAds: ads, googleAnalytics: ga, googleAds: gads, tiktok: tt, stripe: st, shopifyAnalytics: sa, apollo: ap, costs } = data;

  return (
    <div className="space-y-6">
      {/* ── Header Controls ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-sm font-mono transition-colors ${
                days === d ? 'bg-mc-accent text-white' : 'bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data.fetchedAt && (
            <span className="text-xs text-mc-text-secondary font-mono">
              {new Date(data.fetchedAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData} disabled={loading}
            className="p-2 rounded bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Pill Tab Navigation ── */}
      <div className="flex items-center gap-1 bg-mc-bg-tertiary rounded-lg p-1 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-mc-accent/20 text-mc-accent'
                : 'text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── OVERVIEW TAB ── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Cost Overview */}
          <PlatformSection title="Cost Overview" icon={DollarSign} iconColor="text-mc-accent-yellow" configured={true}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total Monthly (Actual)" value={fmtUSD(costs.totalMonthly)} icon={DollarSign} color="text-mc-accent-yellow" sub="Direct charges only" />
              <StatCard label="Direct API (OpenAI)" value={fmtUSD(costs.llmActual)} icon={Cpu} color="text-mc-accent-purple" sub="Billed to API account" />
              <StatCard label="Ad Spend" value={fmtUSD(costs.adSpend)} icon={Zap} color="text-[#1877f2]" sub={ads?.hasData || gads?.hasData || tt?.hasData ? `${days}d Meta + Google + TikTok` : 'No active campaigns'} />
              <StatCard label="Fixed / SaaS" value={fmtUSD(costs.fixedMonthly)} icon={CreditCard} color="text-mc-accent-green" sub="Monthly recurring" />
            </div>
            <CostBar items={[
              { label: 'Direct API (OpenAI)', value: costs.llmActual, color: '#a371f7' },
              { label: 'Ad Spend', value: costs.adSpend, color: '#1877f2' },
              { label: 'Fixed / SaaS', value: costs.fixedMonthly, color: '#3fb950' },
            ]} />
            {costs.operatorEstimated > 0 && (
              <div className="mt-3 px-3 py-2 bg-mc-bg-tertiary border border-mc-border rounded text-xs text-mc-text-secondary">
                <span className="text-mc-text font-medium">{fmtUSD(costs.operatorEstimated)}</span> Anthropic usage via Claude Code operator (included in subscription, not billed to API account)
              </div>
            )}
            {costs.fixedBreakdown.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                {costs.fixedBreakdown.map(c => (
                  <div key={c.id} className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-center">
                    <div className="text-lg font-bold text-mc-text font-mono">{fmtUSD(c.monthly)}</div>
                    <div className="text-xs text-mc-text-secondary">{c.name}</div>
                  </div>
                ))}
              </div>
            )}
          </PlatformSection>

          {/* LLM Token Usage */}
          <PlatformSection title="LLM Token Usage" icon={Bot} iconColor="text-mc-accent-purple" configured={tc.configured} error={tc.error}>
            {tc.summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Cost" value={fmtUSD(tc.summary.totalCost)} icon={DollarSign} color="text-mc-accent-yellow" />
                  <StatCard label="Total Tokens" value={fmtTokens(tc.summary.totalTokens)} icon={Cpu} color="text-mc-accent-purple" sub={`${fmtTokens(tc.summary.totalInputTokens)} in / ${fmtTokens(tc.summary.totalOutputTokens)} out`} />
                  <StatCard label="API Calls" value={(tc.summary.totalCalls || 0).toLocaleString()} icon={Zap} color="text-mc-accent" />
                  <StatCard label="Agents" value={tc.byAgent?.length || 0} icon={Bot} color="text-mc-accent-green" />
                </div>

                {tc.byModel && tc.byModel.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Cost by Model</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Model</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Calls</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Input</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Output</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Cache</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tc.byModel.map(m => (
                            <tr key={m.model} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text font-mono text-xs">{m.model}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{m.calls.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{fmtTokens(m.inputTokens)}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{fmtTokens(m.outputTokens)}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono text-mc-text-secondary">{fmtTokens((m.cacheReadTokens || 0) + (m.cacheWriteTokens || 0))}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono font-bold">{fmtUSD(m.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tc.byAgent && tc.byAgent.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Cost by Agent</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Agent</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Calls</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Tokens</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tc.byAgent.map(a => (
                            <tr key={a.agent} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text">
                                <span className="font-mono uppercase">{a.agent}</span>
                              </td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{a.calls.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{fmtTokens(a.inputTokens + a.outputTokens)}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono font-bold">{fmtUSD(a.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tc.byProvider && tc.byProvider.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Billing by Provider</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Provider</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Calls</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Est. Cost</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Billing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tc.byProvider.map((p, i) => (
                            <tr key={i} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text font-mono capitalize">{p.provider}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{p.calls.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{fmtUSD(p.estimatedCost)}</td>
                              <td className="px-4 py-2 text-right">
                                <span className={`text-xs px-2 py-0.5 rounded ${p.billing === 'operator' ? 'bg-blue-900/30 text-blue-400' : 'bg-amber-900/30 text-amber-400'}`}>
                                  {p.billing === 'operator' ? 'Subscription' : 'API Billed'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </PlatformSection>

          {/* Quick Stats Grid */}
          <PlatformSection title="Platform Quick Stats" icon={BarChart3} iconColor="text-mc-accent" configured={true}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard
                label="Social Reach"
                value={((fb.metrics?.page_impressions_unique?.total || 0) + (ig.metrics?.reach?.total || 0) + (pin.totals?.IMPRESSION || 0) + (tt.reach || 0)).toLocaleString()}
                icon={Users}
                color="text-[#e4405f]"
                sub="FB + IG + Pin + TT"
              />
              <StatCard
                label="Ad Spend"
                value={fmtUSD((ads.spend || 0) + (gads.spend || 0) + (tt.spend || 0))}
                icon={Target}
                color="text-[#4285f4]"
                sub="Meta + Google + TT"
              />
              <StatCard
                label="Emails Sent"
                value={(sg.summary?.totalSent || 0).toLocaleString()}
                icon={Mail}
                color="text-[#1a82e2]"
                sub={`${sg.summary?.deliveryRate || '0%'} delivered`}
              />
              <StatCard
                label="Web Sessions"
                value={(ga.summary?.totalSessions || 0).toLocaleString()}
                icon={Globe}
                color="text-[#f9ab00]"
                sub={`${(ga.summary?.totalUsers || 0).toLocaleString()} users`}
              />
              <StatCard
                label="Revenue"
                value={fmtUSD((shop.summary?.totalRevenue || 0) + (st?.totalRevenue || 0))}
                icon={DollarSign}
                color="text-[#96bf48]"
                sub="Shopify + Stripe"
              />
              <StatCard
                label="Leads"
                value={(ap.summary?.totalLeads || 0).toLocaleString()}
                icon={UserPlus}
                color="text-[#5856d6]"
                sub={`${ap.summary?.creditsUsed || 0} credits used`}
              />
            </div>
          </PlatformSection>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── SOCIAL MEDIA TAB ── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'social' && (
        <>
          {/* Facebook */}
          <PlatformSection title="Facebook" icon={Facebook} iconColor="text-[#1877f2]" configured={fb.configured} error={fb.error}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Page Fans" value={fb.page?.fans || 0} icon={Users} color="text-[#1877f2]" />
              <StatCard
                label="Impressions"
                value={fb.metrics?.page_impressions_unique?.total || 0}
                icon={Eye} color="text-[#1877f2]"
                sparkData={fb.metrics?.page_impressions_unique?.daily.map(d => d.value)}
                sparkColor="#1877f2"
                sub={`${days}d unique`}
              />
              <StatCard
                label="Engagements"
                value={fb.metrics?.page_post_engagements?.total || 0}
                icon={Heart} color="text-mc-accent-pink"
                sparkData={fb.metrics?.page_post_engagements?.daily.map(d => d.value)}
                sparkColor="#db61a2"
                sub={`${days}d total`}
              />
              <StatCard
                label="Page Views"
                value={fb.metrics?.page_views_total?.total || 0}
                icon={Eye} color="text-mc-accent-green"
                sparkData={fb.metrics?.page_views_total?.daily.map(d => d.value)}
                sparkColor="#3fb950"
                sub={`${days}d`}
              />
            </div>
            {fb.metrics?.page_impressions_unique?.daily && fb.metrics.page_impressions_unique.daily.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Impressions</span>
                <div className="mt-2">
                  <MiniBarChart data={fb.metrics.page_impressions_unique.daily.map(d => ({ label: d.date, value: d.value }))} color="#1877f2" />
                </div>
              </div>
            )}
          </PlatformSection>

          {/* Instagram */}
          <PlatformSection title="Instagram" icon={Instagram} iconColor="text-[#e4405f]" configured={ig.configured} error={ig.error}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Followers" value={ig.metrics?.follower_count?.total || 0} icon={Users} color="text-[#e4405f]" />
              <StatCard
                label="Interactions"
                value={ig.metrics?.total_interactions?.total || 0}
                icon={Heart} color="text-[#e4405f]"
                sub={`${days}d total`}
              />
              <StatCard
                label="Reach"
                value={ig.metrics?.reach?.total || 0}
                icon={TrendingUp} color="text-mc-accent-purple"
                sparkData={ig.metrics?.reach?.daily.map(d => d.value)}
                sparkColor="#a371f7"
                sub={`${days}d total`}
              />
              <StatCard
                label="Profile Views"
                value={ig.metrics?.profile_views?.total || 0}
                icon={MousePointerClick} color="text-mc-accent-yellow"
                sub={`${days}d total`}
              />
            </div>
            {ig.recentPosts && ig.recentPosts.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Recent Posts</span>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ig.recentPosts.slice(0, 6).map(post => (
                    <div key={post.id} className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-sm">
                      <div className="text-mc-text-secondary text-xs mb-1">{post.date} &middot; {post.type}</div>
                      <div className="text-mc-text truncate">{post.caption || '(no caption)'}</div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-mc-text-secondary">
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post.comments}</span>
                        {post.url && (
                          <a href={post.url} target="_blank" rel="noopener" className="ml-auto text-mc-accent hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </PlatformSection>

          {/* Pinterest */}
          <PlatformSection title="Pinterest" icon={Bookmark} iconColor="text-[#e60023]" configured={pin.configured} error={pin.error}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Impressions" value={pin.totals?.IMPRESSION || 0} icon={Eye} color="text-[#e60023]" />
              <StatCard label="Saves" value={pin.totals?.SAVE || 0} icon={Bookmark} color="text-mc-accent-yellow" />
              <StatCard label="Pin Clicks" value={pin.totals?.PIN_CLICK || 0} icon={MousePointerClick} color="text-mc-accent" />
              <StatCard label="Outbound Clicks" value={pin.totals?.OUTBOUND_CLICK || 0} icon={ExternalLink} color="text-mc-accent-green" />
            </div>
            {pin.daily && pin.daily.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Impressions</span>
                <div className="mt-2">
                  <MiniBarChart data={pin.daily.map(d => ({ label: d.date, value: d.impressions }))} color="#e60023" height={56} />
                </div>
              </div>
            )}
            {pin.recentPins && pin.recentPins.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Recent Pins</span>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pin.recentPins.slice(0, 6).map(p => (
                    <div key={p.id} className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-sm">
                      <div className="text-mc-text-secondary text-xs mb-1">{p.date}</div>
                      <div className="text-mc-text truncate">{p.title || '(untitled)'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </PlatformSection>

          {/* TikTok Organic */}
          <PlatformSection title="TikTok (Organic)" icon={Video} iconColor="text-[#fe2c55]" configured={tt.configured} error={tt.error}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Video Plays" value={(tt.videoPlays || 0).toLocaleString()} icon={Video} color="text-[#fe2c55]" sub={tt.period || '30d'} />
              <StatCard label="Reach" value={(tt.reach || 0).toLocaleString()} icon={Users} color="text-[#69c9d0]" />
              <StatCard label="Watched 2s+" value={(tt.videoWatched2s || 0).toLocaleString()} icon={Eye} color="text-mc-accent-purple" />
              <StatCard label="Watched 6s+" value={(tt.videoWatched6s || 0).toLocaleString()} icon={Timer} color="text-mc-accent-yellow" />
            </div>
          </PlatformSection>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── ADVERTISING TAB ── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'advertising' && (
        <>
          {/* Meta Ads */}
          <PlatformSection title="Meta Ads" icon={Facebook} iconColor="text-[#1877f2]" configured={ads.configured} error={ads.error}>
            {ads.hasData ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label="Spend" value={fmtUSD(ads.spend)} icon={DollarSign} color="text-[#1877f2]" />
                <StatCard label="Impressions" value={(ads.impressions || 0).toLocaleString()} icon={Eye} color="text-[#1877f2]" />
                <StatCard label="Clicks" value={(ads.clicks || 0).toLocaleString()} icon={MousePointerClick} color="text-mc-accent" />
                <StatCard label="CPC" value={fmtUSD(ads.cpc || 0)} icon={DollarSign} color="text-mc-accent-purple" />
                <StatCard label="Reach" value={(ads.reach || 0).toLocaleString()} icon={Users} color="text-mc-accent-green" />
              </div>
            ) : (
              <div className="text-sm text-mc-text-secondary">No active campaigns in the selected period.</div>
            )}
          </PlatformSection>

          {/* Google Ads */}
          <PlatformSection title="Google Ads" icon={Zap} iconColor="text-[#4285f4]" configured={gads.configured} error={gads.error}>
            {gads.hasData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatCard label="Spend" value={fmtUSD(gads.spend)} icon={DollarSign} color="text-[#4285f4]" sub={gads.period || '30d'} />
                  <StatCard label="Impressions" value={(gads.impressions || 0).toLocaleString()} icon={Eye} color="text-[#34a853]" />
                  <StatCard label="Clicks" value={(gads.clicks || 0).toLocaleString()} icon={MousePointerClick} color="text-[#f9ab00]" />
                  <StatCard label="Conversions" value={gads.conversions || 0} icon={TrendingUp} color="text-[#ea4335]" />
                  <StatCard label="CPC" value={fmtUSD(gads.cpc || 0)} icon={DollarSign} color="text-mc-accent-purple" />
                </div>
                {gads.dailySpend && gads.dailySpend.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Spend</span>
                    <div className="mt-2">
                      <MiniBarChart data={gads.dailySpend.map(d => ({ label: d.date, value: d.value }))} color="#4285f4" height={56} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-mc-text-secondary">No active campaigns in the selected period.</div>
            )}
          </PlatformSection>

          {/* TikTok Paid */}
          <PlatformSection title="TikTok Ads" icon={Video} iconColor="text-[#fe2c55]" configured={tt.configured} error={tt.error}>
            {tt.hasData ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatCard label="Spend" value={fmtUSD(tt.spend)} icon={DollarSign} color="text-[#fe2c55]" sub={tt.period || '30d'} />
                  <StatCard label="Impressions" value={(tt.impressions || 0).toLocaleString()} icon={Eye} color="text-[#69c9d0]" />
                  <StatCard label="Clicks" value={(tt.clicks || 0).toLocaleString()} icon={MousePointerClick} color="text-[#fe2c55]" />
                  <StatCard label="CPC" value={tt.clicks ? fmtUSD(tt.spend / tt.clicks) : '$0.00'} icon={DollarSign} color="text-mc-accent-purple" />
                  <StatCard label="Conversions" value={tt.conversions || 0} icon={TrendingUp} color="text-mc-accent-green" />
                </div>
                {tt.dailySpend && tt.dailySpend.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Spend</span>
                    <div className="mt-2">
                      <MiniBarChart data={tt.dailySpend.map(d => ({ label: d.date, value: d.value }))} color="#fe2c55" height={56} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-mc-text-secondary">No active campaigns in the selected period.</div>
            )}
          </PlatformSection>

          {/* Cross-platform comparison */}
          <PlatformSection title="Cross-Platform Comparison" icon={Target} iconColor="text-mc-accent" configured={true}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-mc-bg-tertiary border border-mc-border rounded-lg p-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider block mb-3">Total Spend</span>
                <div className="space-y-2">
                  {[
                    { label: 'Meta Ads', value: ads.spend || 0, color: '#1877f2' },
                    { label: 'Google Ads', value: gads.spend || 0, color: '#4285f4' },
                    { label: 'TikTok Ads', value: tt.spend || 0, color: '#fe2c55' },
                  ].map(p => (
                    <div key={p.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                        <span className="text-sm text-mc-text">{p.label}</span>
                      </div>
                      <span className="text-sm font-mono text-mc-text font-bold">{fmtUSD(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-mc-bg-tertiary border border-mc-border rounded-lg p-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider block mb-3">Total Impressions</span>
                <div className="space-y-2">
                  {[
                    { label: 'Meta Ads', value: ads.impressions || 0, color: '#1877f2' },
                    { label: 'Google Ads', value: gads.impressions || 0, color: '#4285f4' },
                    { label: 'TikTok Ads', value: tt.impressions || 0, color: '#fe2c55' },
                  ].map(p => (
                    <div key={p.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                        <span className="text-sm text-mc-text">{p.label}</span>
                      </div>
                      <span className="text-sm font-mono text-mc-text font-bold">{p.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-mc-bg-tertiary border border-mc-border rounded-lg p-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider block mb-3">CPC</span>
                <div className="space-y-2">
                  {[
                    { label: 'Meta Ads', value: ads.cpc || 0, color: '#1877f2' },
                    { label: 'Google Ads', value: gads.cpc || 0, color: '#4285f4' },
                    { label: 'TikTok Ads', value: tt.clicks ? tt.spend / tt.clicks : 0, color: '#fe2c55' },
                  ].map(p => (
                    <div key={p.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                        <span className="text-sm text-mc-text">{p.label}</span>
                      </div>
                      <span className="text-sm font-mono text-mc-text font-bold">{fmtUSD(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PlatformSection>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── EMAIL & OUTREACH TAB ── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'email' && (
        <>
          {/* SendGrid */}
          <PlatformSection title="SendGrid Email" icon={Mail} iconColor="text-[#1a82e2]" configured={sg.configured} error={sg.error}>
            {sg.summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Contacts" value={sg.summary.totalContacts} icon={Users} color="text-[#1a82e2]" />
                  <StatCard
                    label="Delivery Rate" value={sg.summary.deliveryRate} icon={ShieldCheck} color="text-mc-accent-green"
                    sub={`${sg.summary.totalDelivered.toLocaleString()} of ${sg.summary.totalSent.toLocaleString()}`}
                  />
                  <StatCard
                    label="Open Rate" value={sg.summary.openRate} icon={Eye} color="text-mc-accent"
                    sub={`${sg.summary.totalOpens.toLocaleString()} unique opens`}
                  />
                  <StatCard
                    label="Click Rate" value={sg.summary.clickRate} icon={MousePointerClick} color="text-mc-accent-purple"
                    sub={`${sg.summary.totalClicks.toLocaleString()} unique clicks`}
                  />
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4">
                  {[
                    { label: 'Sent', value: sg.summary.totalSent, icon: Send, color: 'text-mc-text-secondary' },
                    { label: 'Delivered', value: sg.summary.totalDelivered, icon: ShieldCheck, color: 'text-mc-accent-green' },
                    { label: 'Opens', value: sg.summary.totalOpens, icon: Eye, color: 'text-mc-accent' },
                    { label: 'Clicks', value: sg.summary.totalClicks, icon: MousePointerClick, color: 'text-mc-accent-purple' },
                    { label: 'Bounces', value: sg.summary.totalBounces, icon: TrendingDown, color: 'text-mc-accent-red' },
                    { label: 'Unsubscribes', value: sg.summary.totalUnsubscribes, icon: UserPlus, color: 'text-mc-accent-yellow' },
                  ].map(m => (
                    <div key={m.label} className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-center">
                      <m.icon className={`w-4 h-4 mx-auto mb-1 ${m.color}`} />
                      <div className="text-lg font-bold text-mc-text">{m.value.toLocaleString()}</div>
                      <div className="text-xs text-mc-text-secondary">{m.label}</div>
                    </div>
                  ))}
                </div>
                {sg.daily && sg.daily.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Deliveries (30d)</span>
                    <div className="mt-2">
                      <MiniBarChart data={sg.daily.map(d => ({ label: d.date, value: d.delivered }))} color="#1a82e2" height={56} />
                    </div>
                  </div>
                )}
              </>
            )}
            {sg.credits && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-center">
                  <div className="text-lg font-bold text-mc-text font-mono">{sg.credits.used.toLocaleString()}</div>
                  <div className="text-xs text-mc-text-secondary">Credits Used</div>
                </div>
                <div className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-center">
                  <div className="text-lg font-bold text-mc-text font-mono">{sg.credits.remain.toLocaleString()}</div>
                  <div className="text-xs text-mc-text-secondary">Credits Remaining</div>
                </div>
                <div className="bg-mc-bg-tertiary border border-mc-border rounded p-3 text-center">
                  <div className="text-lg font-bold text-mc-text font-mono">{sg.credits.total.toLocaleString()}</div>
                  <div className="text-xs text-mc-text-secondary">Monthly Total</div>
                </div>
              </div>
            )}
            {sg.lists && sg.lists.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Subscriber Lists</span>
                <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-mc-border">
                        <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">List</th>
                        <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Contacts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sg.lists.sort((a, b) => b.contact_count - a.contact_count).map(list => (
                        <tr key={list.id} className="border-b border-mc-border/50 last:border-0">
                          <td className="px-4 py-2 text-mc-text">{list.name}</td>
                          <td className="px-4 py-2 text-right text-mc-text font-mono">{list.contact_count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </PlatformSection>

          {/* Apollo */}
          <PlatformSection title="Apollo.io Leads" icon={Users} iconColor="text-[#5856d6]" configured={ap.configured} error={ap.error}>
            {ap.summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Leads" value={ap.summary.totalLeads} icon={Users} color="text-[#5856d6]" sub={`${ap.summary.totalPulls} pulls`} />
                  <StatCard label="Credits Used" value={ap.summary.creditsUsed.toLocaleString()} icon={Zap} color="text-mc-accent-yellow" sub={`of ${ap.summary.monthlyCredits.toLocaleString()}/mo`} />
                  <StatCard label="New Contacts" value={ap.summary.totalNew} icon={UserPlus} color="text-mc-accent-green" />
                  <StatCard label="No Email" value={ap.summary.totalNoEmail} icon={AlertTriangle} color="text-mc-accent-red" sub={`${ap.summary.totalDupes} dupes`} />
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-mc-text-secondary mb-1">
                    <span>Monthly Credits</span>
                    <span className="font-mono">{ap.summary.creditsUsed.toLocaleString()} / {ap.summary.monthlyCredits.toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-mc-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (ap.summary.creditsUsed / ap.summary.monthlyCredits) * 100)}%`,
                        backgroundColor: ap.summary.creditsUsed / ap.summary.monthlyCredits > 0.8 ? '#f85149' : '#5856d6',
                      }}
                    />
                  </div>
                </div>
                {ap.pulls && ap.pulls.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Pull History</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Date</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Enriched</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">New</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Personas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ap.pulls.map((p, i) => (
                            <tr key={i} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text font-mono">{p.date}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{p.enriched.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{p.newLeads.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{p.personas}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </PlatformSection>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── WEB ANALYTICS TAB ── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'web' && (
        <>
        <PlatformSection title="Google Analytics" icon={BarChart3} iconColor="text-[#f9ab00]" configured={ga.configured} error={ga.error}>
          {ga.summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Sessions" value={ga.summary.totalSessions.toLocaleString()} icon={Activity} color="text-[#f9ab00]" sub={`${ga.period || '30d'}`} />
                <StatCard label="Users" value={ga.summary.totalUsers.toLocaleString()} icon={Users} color="text-[#4285f4]" sub={`${ga.summary.totalNewUsers.toLocaleString()} new`} />
                <StatCard label="Page Views" value={ga.summary.totalPageViews.toLocaleString()} icon={Eye} color="text-[#34a853]" />
                <StatCard label="Bounce Rate" value={`${ga.summary.avgBounceRate}%`} icon={TrendingDown} color="text-[#ea4335]" sub={`Avg ${Math.floor(ga.summary.avgDuration / 60)}m ${ga.summary.avgDuration % 60}s duration`} />
              </div>
              {ga.dailySessions && ga.dailySessions.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Sessions</span>
                  <div className="mt-2">
                    <MiniBarChart data={ga.dailySessions.map(d => ({ label: d.date, value: d.value }))} color="#f9ab00" height={56} />
                  </div>
                </div>
              )}
              {ga.topPages && ga.topPages.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Top Pages</span>
                  <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-mc-border">
                          <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Page</th>
                          <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Views</th>
                          <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ga.topPages.map((p, i) => (
                          <tr key={i} className="border-b border-mc-border/50 last:border-0">
                            <td className="px-4 py-2 text-mc-text font-mono text-xs truncate max-w-[300px]">{p.path}</td>
                            <td className="px-4 py-2 text-right text-mc-text font-mono">{p.pageViews.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-mc-text font-mono">{p.sessions.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </PlatformSection>

          {/* Shopify Online Store Analytics */}
          <PlatformSection title="Shopify Online Store" icon={Store} iconColor="text-[#96bf48]" configured={sa?.configured ?? false} error={sa?.error}>
            {sa?.summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard label="Orders" value={sa.summary.totalSessions} icon={ShoppingBag} color="text-[#96bf48]" sub={sa.period} />
                  <StatCard label="Total Orders" value={sa.summary.totalPageviews} icon={Activity} color="text-mc-accent" />
                  <StatCard label="Customers" value={sa.summary.totalVisitors} icon={Users} color="text-mc-accent-purple" />
                </div>

                {sa.dailySessions && sa.dailySessions.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Daily Orders</span>
                    <div className="mt-2">
                      <MiniBarChart data={sa.dailySessions.map(d => ({ label: d.date, value: d.sessions }))} color="#96bf48" height={56} />
                    </div>
                  </div>
                )}

                {sa.byCountry && sa.byCountry.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider block mb-2">Customer Locations</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded-lg p-4">
                      <WorldMap
                        color="#96bf48"
                        valueSuffix="orders"
                        size="responsive"
                        data={sa.byCountry.map(c => ({ country: c.countryCode as any, value: c.sessions }))}
                        backgroundColor="transparent"
                        richInteraction
                      />
                    </div>
                  </div>
                )}

                {sa.byCountry && sa.byCountry.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Top Countries</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Country</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Orders</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Customers</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sa.byCountry.slice(0, 10).map((c, i) => (
                            <tr key={i} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text">{c.country}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{c.sessions.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{c.visitors.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{c.revenue ? `$${c.revenue.toLocaleString()}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </PlatformSection>

        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── REVENUE TAB ── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'revenue' && (
        <>
          {/* Shopify */}
          <PlatformSection title="Shopify" icon={Store} iconColor="text-[#96bf48]" configured={shop.configured} error={shop.error}>
            {shop.summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Total Revenue" value={fmtUSD(shop.summary.totalRevenue)} icon={DollarSign} color="text-[#96bf48]" sub={`${shop.summary.totalOrders} orders`} />
                  <StatCard label="Paid Revenue" value={fmtUSD(shop.summary.paidRevenue)} icon={ShieldCheck} color="text-mc-accent-green" sub={`${shop.summary.paidOrders} paid orders`} />
                  <StatCard label="AOV" value={fmtUSD(shop.summary.aov)} icon={ShoppingBag} color="text-mc-accent-purple" sub="Average order value" />
                  <StatCard label="Products" value={shop.summary.productCount} icon={Package} color="text-mc-accent" />
                </div>

                {shop.monthlyRevenue && shop.monthlyRevenue.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Monthly Revenue</span>
                    <div className="mt-2 flex items-end gap-2" style={{ height: 64 }}>
                      {shop.monthlyRevenue.map((m, i) => {
                        const max = Math.max(...shop.monthlyRevenue!.map(r => r.revenue), 1);
                        return (
                          <div key={i} className="flex flex-col items-center gap-1 flex-1">
                            <div
                              title={`${m.month}: ${fmtUSD(m.revenue)}`}
                              className="w-full rounded-t-sm hover:opacity-80 transition-all"
                              style={{
                                height: Math.max(4, (m.revenue / max) * 56),
                                backgroundColor: '#96bf48',
                                opacity: 0.7 + (m.revenue / max) * 0.3,
                              }}
                            />
                            <span className="text-[10px] text-mc-text-secondary font-mono">{m.month.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {shop.recentOrders && shop.recentOrders.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Recent Orders</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Order</th>
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Date</th>
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Status</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shop.recentOrders.slice(0, 8).map(o => (
                            <tr key={o.name} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text font-mono">{o.name}</td>
                              <td className="px-4 py-2 text-mc-text-secondary">{o.date}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                                  o.status === 'PAID' ? 'bg-green-500/20 text-green-400' :
                                  o.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-mc-bg-secondary text-mc-text-secondary'
                                }`}>
                                  {o.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{fmtUSD(o.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {shop.shop && (
                  <div className="mt-3 text-xs text-mc-text-secondary">
                    {shop.shop.name} &middot; {shop.shop.plan} plan &middot; {shop.shop.domain}
                  </div>
                )}
              </>
            )}
          </PlatformSection>

          {/* Stripe */}
          <PlatformSection title="Stripe" icon={CreditCard} iconColor="text-[#635bff]" configured={st?.configured ?? false} error={st?.error}>
            {st?.totalRevenue !== undefined && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatCard label="Total Revenue" value={fmtUSD(st.totalRevenue || 0)} icon={DollarSign} color="text-[#635bff]" sub={st.period || '30d'} />
                  <StatCard label="Transactions" value={st.totalTransactions || 0} icon={CreditCard} color="text-mc-accent" sub={`${st.successCount || 0} succeeded`} />
                  <StatCard label="Success Rate" value={`${st.successRate || 0}%`} icon={ShieldCheck} color="text-mc-accent-green" />
                  <StatCard label="Refund Rate" value={`${st.refundRate || 0}%`} icon={TrendingDown} color="text-mc-accent-red" sub={st.totalRefunded ? fmtUSD(st.totalRefunded) + ' refunded' : undefined} />
                  <StatCard label="AOV" value={fmtUSD(st.averageOrderValue || 0)} icon={ShoppingBag} color="text-mc-accent-purple" />
                </div>

                {st.balance !== undefined && (
                  <div className="mt-4 bg-mc-bg-tertiary border border-mc-border rounded p-4 flex items-center justify-between">
                    <span className="text-sm text-mc-text-secondary">Available Balance</span>
                    <span className="text-xl font-bold text-mc-text font-mono">{fmtUSD(st.balance)}</span>
                  </div>
                )}

                {st.recentCharges && st.recentCharges.length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs text-mc-text-secondary uppercase tracking-wider mb-2 block">Recent Charges</span>
                    <div className="bg-mc-bg-tertiary border border-mc-border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-mc-border">
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Date</th>
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Description</th>
                            <th className="text-left px-4 py-2 text-mc-text-secondary font-medium">Status</th>
                            <th className="text-right px-4 py-2 text-mc-text-secondary font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {st.recentCharges.map((c, i) => (
                            <tr key={i} className="border-b border-mc-border/50 last:border-0">
                              <td className="px-4 py-2 text-mc-text font-mono text-xs">{new Date(c.created * 1000).toLocaleDateString()}</td>
                              <td className="px-4 py-2 text-mc-text truncate max-w-[200px]">{c.description || '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                                  c.status === 'succeeded' ? 'bg-green-500/20 text-green-400' :
                                  c.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-mc-text font-mono">{fmtUSD(c.amount)} <span className="text-mc-text-secondary uppercase text-xs">{c.currency}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </PlatformSection>
        </>
      )}
    </div>
  );
}
