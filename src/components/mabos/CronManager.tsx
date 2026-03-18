'use client';

import { useState, useEffect } from 'react';
import { Clock, Play, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  agentId: string;
  action: string;
  enabled: boolean | number;
  status: string;
  lastRun?: string;
  nextRun?: string;
  last_run?: string;
  next_run?: string;
  agent_id?: string;
}

export function CronManager() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/mabos/cron');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to load cron jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (job: CronJob) => {
    setTogglingId(job.id);
    const isEnabled = job.enabled === true || job.enabled === 1;
    try {
      const res = await fetch(`/api/mabos/cron/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isEnabled }),
      });
      if (res.ok) {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: !isEnabled } : j));
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleTrigger = async (jobId: string) => {
    setTriggeringId(jobId);
    try {
      await fetch(`/api/mabos/cron/${jobId}/trigger`, { method: 'POST' });
      await loadJobs();
    } catch (err) {
      console.error('Trigger failed:', err);
    } finally {
      setTriggeringId(null);
    }
  };

  const agents = Array.from(new Set(jobs.map(j => j.agentId || j.agent_id || '')));
  const filteredJobs = filterAgent === 'all' ? jobs : jobs.filter(j => (j.agentId || j.agent_id) === filterAgent);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'text-green-400',
      paused: 'text-yellow-400',
      error: 'text-red-400',
    };
    return colors[status] || 'text-mc-text-secondary';
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
          <Clock className="w-5 h-5 text-mc-accent-cyan" />
          <h2 className="text-lg font-semibold">Cron Jobs</h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{jobs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            className="bg-mc-bg border border-mc-border rounded px-2 py-1 text-xs"
          >
            <option value="all">All Agents</option>
            {agents.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button onClick={loadJobs} className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mc-border text-left text-xs text-mc-text-secondary uppercase">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Schedule</th>
              <th className="pb-2 pr-4">Agent</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Last Run</th>
              <th className="pb-2 pr-4">Next Run</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map(job => {
              const isEnabled = job.enabled === true || job.enabled === 1;
              const lastRun = job.lastRun || job.last_run;
              const nextRun = job.nextRun || job.next_run;
              return (
                <tr key={job.id} className="border-b border-mc-border/50 hover:bg-mc-bg-tertiary/50">
                  <td className="py-2.5 pr-4 font-medium">{job.name}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-mc-text-secondary">{job.schedule}</td>
                  <td className="py-2.5 pr-4 text-xs">{job.agentId || job.agent_id}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs ${getStatusColor(job.status)}`}>{job.status}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-mc-text-secondary">
                    {lastRun ? formatDistanceToNow(new Date(lastRun), { addSuffix: true }) : '-'}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-mc-text-secondary">
                    {nextRun ? formatDistanceToNow(new Date(nextRun), { addSuffix: true }) : '-'}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggle(job)}
                        disabled={togglingId === job.id}
                        className="p-1 rounded hover:bg-mc-bg-tertiary"
                        title={isEnabled ? 'Disable' : 'Enable'}
                      >
                        {isEnabled
                          ? <ToggleRight className="w-5 h-5 text-green-400" />
                          : <ToggleLeft className="w-5 h-5 text-mc-text-secondary" />
                        }
                      </button>
                      <button
                        onClick={() => handleTrigger(job.id)}
                        disabled={triggeringId === job.id}
                        className="p-1 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-accent"
                        title="Run Now"
                      >
                        <Play className={`w-4 h-4 ${triggeringId === job.id ? 'animate-pulse' : ''}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredJobs.length === 0 && (
        <p className="text-center py-8 text-mc-text-secondary">No cron jobs found.</p>
      )}
    </div>
  );
}
