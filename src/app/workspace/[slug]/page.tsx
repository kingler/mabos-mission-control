'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ListTodo, Users, Activity, Settings as SettingsIcon, ExternalLink, Home, BarChart3, Target, Shield, Share2, Brain, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { Header } from '@/components/Header';
import { AgentsSidebar } from '@/components/AgentsSidebar';
import { MissionQueue } from '@/components/MissionQueue';
import { CenterPanel } from '@/components/CenterPanel';
import { LiveFeed } from '@/components/LiveFeed';
import { SSEDebugPanel } from '@/components/SSEDebugPanel';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import { debug } from '@/lib/debug';
import type { Task, Workspace } from '@/lib/types';
import type { WorkspaceView, DrillDownState } from '@/components/kanban/GoalAncestry';

type MobileTab = 'queue' | 'agents' | 'feed' | 'settings' | 'kanban';

export default function WorkspacePage() {
  const params = useParams();
  const slug = params.slug as string;

  const { setAgents, setTasks, setEvents, setIsOnline, setIsLoading, isLoading } = useMissionControl();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue');
  const [isPortrait, setIsPortrait] = useState(true);
  const [activeView, setActiveView] = useState<WorkspaceView>('queue');
  const [drillDown, setDrillDown] = useState<DrillDownState>({});

  useSSE();

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)');
    const updateOrientation = () => setIsPortrait(media.matches);

    updateOrientation();
    media.addEventListener('change', updateOrientation);
    window.addEventListener('resize', updateOrientation);

    return () => {
      media.removeEventListener('change', updateOrientation);
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
        } else if (res.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
        setNotFound(true);
        setIsLoading(false);
        return;
      }
    }

    loadWorkspace();
  }, [slug, setIsLoading]);

  useEffect(() => {
    if (!isPortrait && mobileTab === 'queue') {
      setMobileTab('agents');
    }
  }, [isPortrait, mobileTab]);

  useEffect(() => {
    if (!workspace) return;

    const workspaceId = workspace.id;

    async function loadData() {
      try {
        debug.api('Loading workspace data...', { workspaceId });

        const [agentsRes, tasksRes, eventsRes] = await Promise.all([
          fetch(`/api/agents?workspace_id=${workspaceId}`),
          fetch(`/api/tasks?workspace_id=${workspaceId}`),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          debug.api('Loaded tasks', { count: tasksData.length });
          setTasks(tasksData);
        }
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const openclawRes = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (openclawRes.ok) {
          const status = await openclawRes.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadData();
    checkOpenClaw();

    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20');
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 30000);

    const taskPoll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks?workspace_id=${workspaceId}`);
        if (res.ok) {
          const newTasks: Task[] = await res.json();
          const currentTasks = useMissionControl.getState().tasks;

          const hasChanges =
            newTasks.length !== currentTasks.length ||
            newTasks.some((t) => {
              const current = currentTasks.find((ct) => ct.id === t.id);
              return !current || current.updated_at !== t.updated_at;
            });

          if (hasChanges) {
            debug.api('[FALLBACK] Task changes detected via polling, updating store');
            setTasks(newTasks);
          }
        }
      } catch (error) {
        console.error('Failed to poll tasks:', error);
      }
    }, 60000);

    const connectionCheck = setInterval(async () => {
      try {
        const res = await fetch('/api/openclaw/status');
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      clearInterval(eventPoll);
      clearInterval(connectionCheck);
      clearInterval(taskPoll);
    };
  }, [workspace, setAgents, setTasks, setEvents, setIsOnline, setIsLoading]);

  const handleViewChange = (view: WorkspaceView) => {
    setActiveView(view);
    if (view === 'queue' || view === 'goals' || view === 'metrics' || view === 'monitor' || view === 'graph') {
      setDrillDown({});
    }
  };

  const handleDrillDown = (view: WorkspaceView, id: string, title: string) => {
    if (view === 'campaigns') {
      setDrillDown(prev => ({ ...prev, goalId: id, goalTitle: title }));
      setActiveView('campaigns');
    } else if (view === 'initiatives') {
      setDrillDown(prev => ({ ...prev, campaignId: id, campaignTitle: title }));
      setActiveView('initiatives');
    } else if (view === 'delivery') {
      setDrillDown(prev => ({ ...prev, initiativeId: id, initiativeTitle: title }));
      setActiveView('delivery');
    }
  };

  const handleDrillUp = (view: WorkspaceView) => {
    if (view === 'queue') {
      setActiveView('queue');
      setDrillDown({});
    } else if (view === 'goals') {
      setActiveView('goals');
      setDrillDown({});
    } else if (view === 'campaigns') {
      setActiveView('campaigns');
      setDrillDown(prev => ({
        goalId: prev.goalId,
        goalTitle: prev.goalTitle,
      }));
    } else if (view === 'initiatives') {
      setActiveView('initiatives');
      setDrillDown(prev => ({
        goalId: prev.goalId,
        goalTitle: prev.goalTitle,
        campaignId: prev.campaignId,
        campaignTitle: prev.campaignTitle,
      }));
    } else {
      setActiveView(view);
    }
  };

  // Map workspace slug to kanban business_id
  // TODO: Add business_id column to workspaces table for multi-business support
  const WORKSPACE_BUSINESS_MAP: Record<string, string> = { 'default': 'vividwalls' };
  const businessId = WORKSPACE_BUSINESS_MAP[workspace?.slug || ''] || workspace?.slug || 'vividwalls';

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary mb-6">The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90">
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading {slug}...</p>
        </div>
      </div>
    );
  }

  const showMobileBottomTabs = isPortrait;

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} isPortrait={isPortrait} />

      <div className="hidden lg:flex flex-1 overflow-hidden">
        <AgentsSidebar workspaceId={workspace.id} activeView={activeView} onViewChange={handleViewChange} />
        <CenterPanel
          activeView={activeView}
          workspaceId={workspace.id}
          businessId={businessId}
          drillDown={drillDown}
          onDrillDown={handleDrillDown}
          onDrillUp={handleDrillUp}
        />
        <LiveFeed />
      </div>

      <div
        className={`lg:hidden flex-1 overflow-hidden ${
          showMobileBottomTabs ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'pb-[env(safe-area-inset-bottom)]'
        }`}
      >
        {isPortrait ? (
          <>
            {mobileTab === 'queue' && <MissionQueue workspaceId={workspace.id} mobileMode isPortrait />}
            {mobileTab === 'kanban' && (
              <div className="h-full flex flex-col">
                <div className="flex gap-1 p-2 bg-mc-bg-secondary border-b border-mc-border overflow-x-auto shrink-0">
                  {([
                    { view: 'goals' as WorkspaceView, label: 'Goals', icon: <Target className="w-4 h-4" /> },
                    { view: 'metrics' as WorkspaceView, label: 'Metrics', icon: <Activity className="w-4 h-4" /> },
                    { view: 'monitor' as WorkspaceView, label: 'Monitor', icon: <Shield className="w-4 h-4" /> },
                    { view: 'graph' as WorkspaceView, label: 'Graph', icon: <Share2 className="w-4 h-4" /> },
                  ]).map(({ view, label, icon }) => {
                    const isActive = view === 'goals'
                      ? ['goals', 'campaigns', 'initiatives', 'delivery'].includes(activeView)
                      : activeView === view;
                    return (
                      <button
                        key={view}
                        onClick={() => handleViewChange(view)}
                        className={`min-h-9 flex items-center gap-1.5 px-3 rounded text-xs whitespace-nowrap ${
                          isActive ? 'bg-mc-accent text-mc-bg font-medium' : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                        }`}
                      >
                        {icon}
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1 min-h-0">
                  <CenterPanel
                    activeView={activeView === 'queue' ? 'goals' : activeView}
                    workspaceId={workspace.id}
                    businessId={businessId}
                    drillDown={drillDown}
                    onDrillDown={handleDrillDown}
                    onDrillUp={handleDrillUp}
                    mobileMode
                    isPortrait
                  />
                </div>
              </div>
            )}
            {mobileTab === 'agents' && (
              <div className="h-full p-3 overflow-y-auto">
                <AgentsSidebar workspaceId={workspace.id} mobileMode isPortrait />
              </div>
            )}
            {mobileTab === 'feed' && (
              <div className="h-full p-3 overflow-y-auto">
                <LiveFeed mobileMode isPortrait />
              </div>
            )}
            {mobileTab === 'settings' && <MobileSettingsPanel workspace={workspace} />}
          </>
        ) : (
          <div className="h-full p-3 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
            <MissionQueue workspaceId={workspace.id} mobileMode isPortrait={false} />
            <div className="min-w-0 h-full flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setMobileTab('agents')}
                  className={`min-h-11 rounded-lg text-xs ${mobileTab === 'agents' ? 'bg-mc-accent text-mc-bg font-medium' : 'bg-mc-bg-secondary border border-mc-border text-mc-text-secondary'}`}
                >
                  Agents
                </button>
                <button
                  onClick={() => setMobileTab('feed')}
                  className={`min-h-11 rounded-lg text-xs ${mobileTab === 'feed' ? 'bg-mc-accent text-mc-bg font-medium' : 'bg-mc-bg-secondary border border-mc-border text-mc-text-secondary'}`}
                >
                  Feed
                </button>
                <button
                  onClick={() => setMobileTab('settings')}
                  className={`min-h-11 rounded-lg text-xs ${mobileTab === 'settings' ? 'bg-mc-accent text-mc-bg font-medium' : 'bg-mc-bg-secondary border border-mc-border text-mc-text-secondary'}`}
                >
                  Settings
                </button>
              </div>

              <div className="min-h-0 flex-1">
                {mobileTab === 'settings' ? (
                  <MobileSettingsPanel workspace={workspace} denseLandscape />
                ) : mobileTab === 'agents' ? (
                  <AgentsSidebar workspaceId={workspace.id} mobileMode isPortrait={false} />
                ) : (
                  <LiveFeed mobileMode isPortrait={false} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showMobileBottomTabs && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-mc-border bg-mc-bg-secondary pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 gap-1 p-2">
            <MobileTabButton label="Queue" active={mobileTab === 'queue'} icon={<ListTodo className="w-5 h-5" />} onClick={() => setMobileTab('queue')} />
            <MobileTabButton label="Kanban" active={mobileTab === 'kanban'} icon={<Target className="w-5 h-5" />} onClick={() => setMobileTab('kanban')} />
            <MobileTabButton label="Agents" active={mobileTab === 'agents'} icon={<Users className="w-5 h-5" />} onClick={() => setMobileTab('agents')} />
            <MobileTabButton label="Feed" active={mobileTab === 'feed'} icon={<Activity className="w-5 h-5" />} onClick={() => setMobileTab('feed')} />
            <MobileTabButton label="Settings" active={mobileTab === 'settings'} icon={<SettingsIcon className="w-5 h-5" />} onClick={() => setMobileTab('settings')} />
          </div>
        </nav>
      )}

      <SSEDebugPanel />
    </div>
  );
}

function MobileTabButton({ label, active, icon, onClick }: { label: string; active: boolean; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-11 rounded-lg flex flex-col items-center justify-center text-xs ${
        active ? 'bg-mc-accent text-mc-bg font-medium' : 'text-mc-text-secondary'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MobileSettingsPanel({ workspace, denseLandscape = false }: { workspace: Workspace; denseLandscape?: boolean }) {
  return (
    <div className={`h-full overflow-y-auto ${denseLandscape ? 'p-0 pb-[env(safe-area-inset-bottom)]' : 'p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]'}`}>
      <div className="space-y-3">
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <div className="text-sm text-mc-text-secondary mb-2">Current workspace</div>
          <div className="flex items-center gap-2 text-base font-medium">
            <span>{workspace.icon}</span>
            <span>{workspace.name}</span>
          </div>
          <div className="text-xs text-mc-text-secondary mt-1">/{workspace.slug}</div>
        </div>


        {/* MABOS Section */}
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-mc-text-secondary mb-3">MABOS</div>
          <div className="space-y-1">
            <Link href="/mabos/agents" className="w-full min-h-11 flex items-center gap-2 px-3 rounded text-sm text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors">
              <Brain className="w-4 h-4" />
              <span>Agents</span>
            </Link>
            <Link href="/mabos/decisions" className="w-full min-h-11 flex items-center gap-2 px-3 rounded text-sm text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors">
              <AlertTriangle className="w-4 h-4" />
              <span>Decisions</span>
            </Link>
            <Link href="/mabos/cron" className="w-full min-h-11 flex items-center gap-2 px-3 rounded text-sm text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors">
              <Clock className="w-4 h-4" />
              <span>Cron Jobs</span>
            </Link>
            <Link href="/mabos/messages" className="w-full min-h-11 flex items-center gap-2 px-3 rounded text-sm text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary transition-colors">
              <MessageSquare className="w-4 h-4" />
              <span>Messages</span>
            </Link>
          </div>
        </div>

        <Link href={`/workspace/${workspace.slug}/activity`} className="w-full min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg-secondary flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Agent Activity Dashboard
          </span>
          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
        </Link>
        <Link href="/settings" className="w-full min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg-secondary flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            Open Mission Control Settings
          </span>
          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
        </Link>

        <Link href="/" className="w-full min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg-secondary flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Home className="w-4 h-4" />
            Back to Workspaces
          </span>
          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
        </Link>
      </div>
    </div>
  );
}
