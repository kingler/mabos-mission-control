'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, RefreshCw, Filter, ChevronDown, ChevronRight, Mail, MailOpen } from 'lucide-react';

interface Message {
  id: string;
  from: string;
  to: string;
  performative: string;
  content: string;
  priority: string;
  timestamp: string;
  read: boolean;
  read_at?: string;
  reply_to?: string;
  agentContext: string;
}

interface MessagesResponse {
  messages: Message[];
  total: number;
  agents: string[];
  performatives: string[];
}

const PERFORMATIVE_COLORS: Record<string, string> = {
  REQUEST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  QUERY: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  CONFIRM: 'bg-green-500/20 text-green-400 border-green-500/30',
  INFORM: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  ACCEPT: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal: 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border',
};

const PAGE_SIZE = 50;

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function AgentMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [agents, setAgents] = useState<string[]>([]);
  const [performatives, setPerformatives] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterPerformative, setFilterPerformative] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  // Pagination
  const [offset, setOffset] = useState(0);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (filterAgent !== 'all') params.set('agent', filterAgent);
    if (filterPerformative !== 'all') params.set('performative', filterPerformative);
    if (filterPriority !== 'all') params.set('priority', filterPriority);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return `/api/mabos/messages?${params.toString()}`;
  }, [filterAgent, filterPerformative, filterPriority, offset]);

  const loadMessages = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const res = await fetch(buildUrl());
      if (res.ok) {
        const data: MessagesResponse = await res.json();
        setMessages(prev => append ? [...prev, ...data.messages] : data.messages);
        setTotal(data.total);
        setAgents(data.agents);
        setPerformatives(data.performatives);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  // Reset pagination when filters change
  useEffect(() => {
    setOffset(0);
    setMessages([]);
  }, [filterAgent, filterPerformative, filterPriority]);

  useEffect(() => {
    loadMessages(offset > 0);
  }, [loadMessages, offset]);

  const handleLoadMore = () => {
    setOffset(prev => prev + PAGE_SIZE);
  };

  const hasMore = messages.length < total;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-mc-accent" />
          <h2 className="text-lg font-semibold">Agent Messages</h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">
            {total.toLocaleString()}
          </span>
        </div>
        <button
          onClick={() => { setOffset(0); setMessages([]); loadMessages(); }}
          className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-mc-text-secondary" />

        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          className="bg-mc-bg border border-mc-border rounded px-2 py-1 text-xs"
        >
          <option value="all">All Agents</option>
          {agents.map(a => (
            <option key={a} value={a}>{a.toUpperCase()}</option>
          ))}
        </select>

        <select
          value={filterPerformative}
          onChange={e => setFilterPerformative(e.target.value)}
          className="bg-mc-bg border border-mc-border rounded px-2 py-1 text-xs"
        >
          <option value="all">All Types</option>
          {performatives.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="bg-mc-bg border border-mc-border rounded px-2 py-1 text-xs"
        >
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
        </select>
      </div>

      {/* Message List */}
      {!loading && messages.length === 0 ? (
        <p className="text-center py-8 text-mc-text-secondary">No messages found.</p>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => {
            const isExpanded = expandedId === msg.id;
            return (
              <div
                key={msg.id}
                className="bg-mc-bg rounded-lg border border-mc-border overflow-hidden"
              >
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-mc-bg-tertiary/50 transition-colors"
                >
                  {/* Read indicator */}
                  {msg.read
                    ? <MailOpen className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                    : <Mail className="w-4 h-4 text-mc-accent flex-shrink-0" />
                  }

                  {/* From → To */}
                  <span className="text-sm font-medium min-w-0 truncate">
                    <span className="text-mc-text">{msg.from.toUpperCase()}</span>
                    <span className="text-mc-text-secondary mx-1">&rarr;</span>
                    <span className="text-mc-text">{msg.to.toUpperCase()}</span>
                  </span>

                  {/* Performative badge */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
                    PERFORMATIVE_COLORS[msg.performative] || PERFORMATIVE_COLORS.INFORM
                  }`}>
                    {msg.performative}
                  </span>

                  {/* Priority badge (only for non-normal) */}
                  {msg.priority !== 'normal' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      PRIORITY_COLORS[msg.priority] || PRIORITY_COLORS.normal
                    }`}>
                      {msg.priority}
                    </span>
                  )}

                  {/* Content preview */}
                  <span className="text-xs text-mc-text-secondary truncate flex-1 min-w-0">
                    {msg.content.slice(0, 80)}{msg.content.length > 80 ? '...' : ''}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[10px] text-mc-text-secondary flex-shrink-0 whitespace-nowrap">
                    {timeAgo(msg.timestamp)}
                  </span>

                  {/* Expand icon */}
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                  }
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-mc-border">
                    <pre className="text-xs text-mc-text-secondary whitespace-pre-wrap mt-3 max-h-64 overflow-y-auto leading-relaxed">
                      {msg.content}
                    </pre>
                    <div className="flex items-center gap-4 mt-3 text-[10px] text-mc-text-secondary">
                      <span>ID: {msg.id}</span>
                      {msg.reply_to && <span>Reply to: {msg.reply_to}</span>}
                      {msg.read_at && <span>Read: {new Date(msg.read_at).toLocaleString()}</span>}
                      <span>{new Date(msg.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Load More */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="w-full py-3 text-sm text-mc-accent hover:bg-mc-bg-tertiary/50 rounded-lg border border-mc-border mt-2"
            >
              {loading ? 'Loading...' : `Load More (${messages.length} of ${total.toLocaleString()})`}
            </button>
          )}
        </div>
      )}

      {/* Initial loading state */}
      {loading && messages.length === 0 && (
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
        </div>
      )}
    </div>
  );
}
