'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Table, Calendar, RefreshCw } from 'lucide-react';
import { CronManager } from '@/components/mabos/CronManager';
import { CronCalendar } from '@/components/mabos/CronCalendar';
import { SyncStatus } from '@/components/mabos/SyncStatus';

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

export default function MabosCronPage() {
  const [view, setView] = useState<'table' | 'calendar'>('calendar');
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/workspace/default" className="text-mc-text-secondary hover:text-mc-text">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold">MABOS Cron Jobs</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex bg-mc-bg rounded border border-mc-border overflow-hidden">
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                  view === 'table'
                    ? 'bg-mc-bg-tertiary text-mc-text'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                onClick={() => setView('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                  view === 'calendar'
                    ? 'bg-mc-bg-tertiary text-mc-text'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Calendar
              </button>
            </div>
            <SyncStatus />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
          </div>
        ) : view === 'table' ? (
          <CronManager />
        ) : (
          <CronCalendar jobs={jobs} />
        )}
      </main>
    </div>
  );
}
