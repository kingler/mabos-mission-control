'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

interface DecisionOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
}

interface Decision {
  id: string;
  title: string;
  summary: string;
  urgency: string;
  agentId: string;
  agentName: string;
  businessId: string;
  businessName: string;
  options?: DecisionOption[];
  agentRecommendation?: string;
  createdAt: string;
}

export function DecisionsPanel() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    loadDecisions();
  }, []);

  const loadDecisions = async () => {
    try {
      const res = await fetch('/api/mabos/decisions');
      if (res.ok) {
        const data = await res.json();
        setDecisions(data.decisions || []);
      }
    } catch (err) {
      console.error('Failed to load decisions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (decisionId: string, optionId: string, action: 'approve' | 'reject' | 'defer') => {
    setResolvingId(decisionId);
    try {
      const res = await fetch(`/api/mabos/decisions/${decisionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: action, optionId }),
      });
      if (res.ok) {
        setDecisions(prev => prev.filter(d => d.id !== decisionId));
      }
    } catch (err) {
      console.error('Failed to resolve decision:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      low: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
    };
    return styles[urgency] || styles.low;
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
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold">Pending Decisions</h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">{decisions.length}</span>
        </div>
        <button onClick={loadDecisions} className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {decisions.length === 0 ? (
        <div className="text-center py-8 text-mc-text-secondary">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No pending decisions</p>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map(d => (
            <div key={d.id} className="bg-mc-bg rounded-lg border border-mc-border p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-medium">{d.title || 'Untitled Decision'}</h3>
                  <p className="text-sm text-mc-text-secondary mt-1">{d.summary}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded border whitespace-nowrap ${getUrgencyBadge(d.urgency)}`}>
                  {d.urgency}
                </span>
              </div>

              <div className="text-xs text-mc-text-secondary mb-3">
                Agent: <span className="text-mc-text">{d.agentName || d.agentId}</span>
                {d.agentRecommendation && (
                  <span className="ml-2 text-green-400">Recommends: {d.agentRecommendation}</span>
                )}
              </div>

              {d.options && d.options.length > 0 ? (
                <div className="space-y-2">
                  {d.options.map(opt => (
                    <div
                      key={opt.id}
                      className={`flex items-center justify-between p-3 rounded border ${
                        opt.recommended ? 'border-green-500/40 bg-green-500/5' : 'border-mc-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{opt.label}</span>
                          {opt.recommended && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">recommended</span>
                          )}
                        </div>
                        {opt.description && <p className="text-xs text-mc-text-secondary mt-0.5">{opt.description}</p>}
                      </div>

                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => handleResolve(d.id, opt.id, 'approve')}
                          disabled={resolvingId === d.id}
                          className="p-1.5 rounded hover:bg-green-500/20 text-mc-text-secondary hover:text-green-400"
                          title="Approve"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResolve(d.id, opt.id, 'reject')}
                          disabled={resolvingId === d.id}
                          className="p-1.5 rounded hover:bg-red-500/20 text-mc-text-secondary hover:text-red-400"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleResolve(d.id, opt.id, 'defer')}
                          disabled={resolvingId === d.id}
                          className="p-1.5 rounded hover:bg-yellow-500/20 text-mc-text-secondary hover:text-yellow-400"
                          title="Defer"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handleResolve(d.id, '', 'approve')}
                    disabled={resolvingId === d.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 text-sm"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleResolve(d.id, '', 'reject')}
                    disabled={resolvingId === d.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => handleResolve(d.id, '', 'defer')}
                    disabled={resolvingId === d.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 text-yellow-400 text-sm"
                  >
                    <Clock className="w-3.5 h-3.5" /> Defer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
