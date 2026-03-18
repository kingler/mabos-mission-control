'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import MetricsDashboard from '@/components/mabos/MetricsDashboard';
import { SyncStatus } from '@/components/mabos/SyncStatus';

export default function MabosMetricsPage() {
  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/workspace/default" className="text-mc-text-secondary hover:text-mc-text">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold">MABOS Metrics</h1>
          </div>
          <SyncStatus />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <MetricsDashboard />
      </main>
    </div>
  );
}
