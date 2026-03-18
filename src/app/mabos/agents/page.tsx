'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { AgentHierarchy } from '@/components/mabos/AgentHierarchy';
import { AgentDetailPanel } from '@/components/mabos/AgentDetailPanel';
import { SyncStatus } from '@/components/mabos/SyncStatus';

export default function MabosAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="min-h-screen bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/workspace/default" className="text-mc-text-secondary hover:text-mc-text">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold">MABOS Agents</h1>
          </div>
          <SyncStatus />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <AgentHierarchy onSelectAgent={(a) => setSelectedAgent({ id: a.id, name: a.name })} />
      </main>

      {selectedAgent && (
        <AgentDetailPanel
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
