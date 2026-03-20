'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Inbox, ListTodo, RefreshCw, Brain, Activity } from 'lucide-react';
import { CognitiveActivityFeed } from './CognitiveActivityFeed';

interface AgentDetailPanelProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

type Tab = 'files' | 'messages' | 'tasks' | 'activity';

interface AgentFile {
  filename: string;
  category: string;
  size: number;
  modified: string;
}

export function AgentDetailPanel({ agentId, agentName, onClose }: AgentDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('files');
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ inbox: string; outbox: string }>({ inbox: '', outbox: '' });
  const [bdiDetail, setBdiDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelectedFile(null);
    setFileContent(null);
    setTab('files');
    loadData();
  }, [agentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [detailRes, filesRes, msgsRes] = await Promise.all([
        fetch(`/api/mabos/agents/${agentId}`),
        fetch(`/api/mabos/agents/${agentId}/files`),
        fetch(`/api/mabos/agents/${agentId}/messages`),
      ]);

      if (detailRes.ok) {
        const data = await detailRes.json();
        setBdiDetail(data.bdiDetail);
      }
      if (filesRes.ok) {
        const data = await filesRes.json();
        setFiles(data.files || []);
      }
      if (msgsRes.ok) {
        setMessages(await msgsRes.json());
      }
    } catch (err) {
      console.error('Failed to load agent detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (filename: string) => {
    setSelectedFile(filename);
    setFileContent(null);
    try {
      const res = await fetch(`/api/mabos/agents/${agentId}/files?filename=${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content || '');
      }
    } catch (err) {
      setFileContent('Failed to load file');
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'files', label: 'Cognitive Files', icon: FileText },
    { id: 'messages', label: 'Messages', icon: Inbox },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-mc-bg-secondary border-l border-mc-border z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-mc-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{agentName}</h3>
          {bdiDetail && (
            <div className="flex items-center gap-3 text-xs text-mc-text-secondary mt-1">
              <span>B:{(bdiDetail as Record<string, number>).beliefCount}</span>
              <span>G:{(bdiDetail as Record<string, number>).goalCount}</span>
              <span>I:{(bdiDetail as Record<string, number>).intentionCount}</span>
              <span>D:{(bdiDetail as Record<string, number>).desireCount}</span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-mc-bg-tertiary rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-mc-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors ${
              tab === t.id
                ? 'border-mc-accent text-mc-accent'
                : 'border-transparent text-mc-text-secondary hover:text-mc-text'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
          </div>
        ) : tab === 'files' ? (
          <div className="space-y-2">
            {selectedFile && fileContent !== null ? (
              <div>
                <button
                  onClick={() => { setSelectedFile(null); setFileContent(null); }}
                  className="text-sm text-mc-accent mb-3 hover:underline"
                >
                  &larr; Back to files
                </button>
                <h4 className="font-medium mb-2">{selectedFile}</h4>
                <pre className="bg-mc-bg p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border">
                  {fileContent}
                </pre>
              </div>
            ) : (
              files.map(f => (
                <button
                  key={f.filename}
                  onClick={() => loadFile(f.filename)}
                  className="w-full flex items-center gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border/50 hover:border-mc-accent/40 transition-colors text-left"
                >
                  <FileText className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{f.filename}</div>
                    <div className="text-xs text-mc-text-secondary">{f.category} &middot; {f.size} bytes</div>
                  </div>
                </button>
              ))
            )}
            {files.length === 0 && <p className="text-mc-text-secondary text-sm">No cognitive files found.</p>}
          </div>
        ) : tab === 'messages' ? (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Inbox className="w-4 h-4" /> Inbox
              </h4>
              <pre className="bg-mc-bg p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border max-h-60">
                {messages.inbox || 'Empty'}
              </pre>
            </div>
            <div>
              <h4 className="font-medium text-sm mb-2">Outbox</h4>
              <pre className="bg-mc-bg p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border max-h-60">
                {messages.outbox || 'Empty'}
              </pre>
            </div>
          </div>
        ) : tab === 'activity' ? (
          <CognitiveActivityFeed agentId={agentId} compact />
        ) : (
          <p className="text-mc-text-secondary text-sm">Task assignments for this agent will appear here after sync.</p>
        )}
      </div>
    </div>
  );
}
