'use client';

import { Shield } from 'lucide-react';

export function MonitorDashboard() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-mc-border flex items-center gap-2">
        <Shield className="w-4 h-4 text-mc-accent-yellow" />
        <span className="text-sm font-medium uppercase tracking-wider">Monitor</span>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Shield className="w-12 h-12 text-mc-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-mc-text mb-2">Monitor Dashboard</h3>
          <p className="text-sm text-mc-text-secondary">
            WIP limit status, agent silence alerts, and portfolio health score coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
