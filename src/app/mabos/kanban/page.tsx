'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, LayoutGrid, BarChart3 } from 'lucide-react';
import { KanbanBoard } from '@/components/mabos/KanbanBoard';
import MetricsDashboard from '@/components/mabos/MetricsDashboard';
import { SyncStatus } from '@/components/mabos/SyncStatus';

type Tab = 'board' | 'metrics';

export default function MabosKanbanPage() {
  const [tab, setTab] = useState<Tab>('board');

  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/workspace/default" className="text-mc-text-secondary hover:text-mc-text">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold">Goal-Driven Kanban</h1>
            <div className="flex items-center bg-mc-bg-tertiary rounded-lg p-0.5 ml-4">
              <button
                onClick={() => setTab('board')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  tab === 'board'
                    ? 'bg-mc-accent/20 text-mc-accent'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Board
              </button>
              <button
                onClick={() => setTab('metrics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  tab === 'metrics'
                    ? 'bg-mc-accent/20 text-mc-accent'
                    : 'text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Metrics
              </button>
            </div>
          </div>
          <SyncStatus />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'board' ? <KanbanBoard /> : <MetricsDashboard />}
      </main>
    </div>
  );
}
