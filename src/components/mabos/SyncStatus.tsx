'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SyncState {
  entity_type: string;
  last_synced_at: string;
  last_sync_status: string | null;
  error_message: string | null;
}

export function SyncStatus() {
  const [states, setStates] = useState<SyncState[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    loadSyncState();
    const interval = setInterval(loadSyncState, 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadSyncState = async () => {
    try {
      const res = await fetch('/api/mabos/sync');
      if (res.ok) {
        const data = await res.json();
        setStates(data.states || []);
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/mabos/sync', { method: 'POST' });
      await loadSyncState();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const allState = states.find(s => s.entity_type === 'all');
  const lastSync = allState?.last_synced_at;
  const hasError = states.some(s => s.last_sync_status === 'error');

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-400" />
          )}
          <span className="text-xs font-medium uppercase text-mc-text-secondary">MABOS Sync</span>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text"
          title="Sync Now"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {hasError ? (
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
        )}
        <span className="text-mc-text-secondary">
          {lastSync
            ? `Last sync ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
            : 'Not synced yet'}
        </span>
      </div>

      {hasError && (
        <div className="mt-2 text-xs text-red-400">
          {states.filter(s => s.error_message).map(s => (
            <div key={s.entity_type}>{s.entity_type}: {s.error_message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
