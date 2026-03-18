'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, Filter } from 'lucide-react';

interface AgentMessage {
  agentId: string;
  agentName: string;
  direction: 'inbox' | 'outbox';
  content: string;
}

interface MabosAgentRow {
  id: string;
  name: string;
  gateway_agent_id: string;
  avatar_emoji: string;
}

export function AgentMessages() {
  const [agents, setAgents] = useState<MabosAgentRow[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>('all');

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/mabos/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
        // Load messages for all agents
        await loadAllMessages(data);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllMessages = async (agentList: MabosAgentRow[]) => {
    const allMsgs: AgentMessage[] = [];

    for (const agent of agentList) {
      try {
        const res = await fetch(`/api/mabos/agents/${agent.id}/messages`);
        if (res.ok) {
          const data = await res.json();
          const isHtml = (s: string) => s.trim().startsWith('<!') || s.trim().startsWith('<html');
          if (data.inbox && !isHtml(data.inbox)) {
            allMsgs.push({
              agentId: agent.id,
              agentName: agent.name,
              direction: 'inbox',
              content: data.inbox,
            });
          }
          if (data.outbox && !isHtml(data.outbox)) {
            allMsgs.push({
              agentId: agent.id,
              agentName: agent.name,
              direction: 'outbox',
              content: data.outbox,
            });
          }
        }
      } catch {
        // Skip agents with no messages
      }
    }

    setMessages(allMsgs);
  };

  const filteredMessages = filterAgent === 'all'
    ? messages
    : messages.filter(m => m.agentId === filterAgent);

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
          <MessageSquare className="w-5 h-5 text-mc-accent" />
          <h2 className="text-lg font-semibold">Agent Messages</h2>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-mc-text-secondary" />
          <select
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            className="bg-mc-bg border border-mc-border rounded px-2 py-1 text-xs"
          >
            <option value="all">All Agents</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button onClick={() => { setLoading(true); loadAgents(); }} className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filteredMessages.length === 0 ? (
        <p className="text-center py-8 text-mc-text-secondary">No messages found.</p>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((msg, i) => {
            const agent = agents.find(a => a.id === msg.agentId);
            return (
              <div key={`${msg.agentId}-${msg.direction}-${i}`} className="bg-mc-bg rounded-lg border border-mc-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{agent?.avatar_emoji || '🤖'}</span>
                  <span className="font-medium text-sm">{msg.agentName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    msg.direction === 'inbox'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {msg.direction}
                  </span>
                </div>
                <pre className="text-xs text-mc-text-secondary whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                  {msg.content}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
