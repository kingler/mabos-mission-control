import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, relative } from 'path';
import { homedir } from 'os';

// ─── Types ───

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  performative: 'REQUEST' | 'QUERY' | 'CONFIRM' | 'INFORM' | 'ACCEPT';
  content: string;
  priority: 'normal' | 'urgent' | 'high';
  timestamp: string;
  read: boolean;
  read_at?: string;
  reply_to?: string;
  _agentDir: string;
}

export interface DecisionQueueItem {
  id: string;
  agent: string;
  title: string;
  description: string;
  options: { id: string; label: string; impact: string; cost: string | number; risk: string }[];
  recommendation: string;
  urgency: 'medium' | 'high' | 'critical';
  status: string;
  created: string;
}

// ─── Helpers ───

const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT
  || join(homedir(), '.openclaw', 'workspace');

function findFilesRecursive(dir: string, filename: string, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          findFilesRecursive(fullPath, filename, results);
        } else if (entry === filename) {
          results.push(fullPath);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return results;
}

// ─── Public API ───

export function readAllInboxMessages(): InboxMessage[] {
  const agentsDir = join(WORKSPACE_ROOT, 'agents');
  const inboxFiles = findFilesRecursive(agentsDir, 'inbox.json');
  const allMessages: InboxMessage[] = [];

  for (const filePath of inboxFiles) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const messages: unknown[] = JSON.parse(raw);
      const agentDir = relative(agentsDir, filePath).replace(/\/inbox\.json$/, '');

      for (const msg of messages) {
        const m = msg as Record<string, unknown>;
        allMessages.push({
          id: String(m.id || ''),
          from: String(m.from || ''),
          to: String(m.to || ''),
          performative: (m.performative as InboxMessage['performative']) || 'INFORM',
          content: String(m.content || ''),
          priority: (m.priority as InboxMessage['priority']) || 'normal',
          timestamp: String(m.timestamp || ''),
          read: Boolean(m.read),
          read_at: m.read_at ? String(m.read_at) : undefined,
          reply_to: m.reply_to ? String(m.reply_to) : undefined,
          _agentDir: agentDir,
        });
      }
    } catch {
      // Skip malformed files
    }
  }

  // Sort by timestamp descending
  allMessages.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime() || 0;
    const tb = new Date(b.timestamp).getTime() || 0;
    return tb - ta;
  });

  return allMessages;
}

export function readDecisionQueue(): DecisionQueueItem[] {
  const filePath = join(WORKSPACE_ROOT, 'decision-queue.json');
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const items: unknown[] = JSON.parse(raw);
    return items.map((item) => {
      const d = item as Record<string, unknown>;
      return {
        id: String(d.id || ''),
        agent: String(d.agent || ''),
        title: String(d.title || ''),
        description: String(d.description || ''),
        options: Array.isArray(d.options)
          ? d.options.map((o: Record<string, unknown>) => ({
              id: String(o.id || ''),
              label: String(o.label || ''),
              impact: String(o.impact || ''),
              cost: o.cost != null ? String(o.cost) : '0',
              risk: String(o.risk || ''),
            }))
          : [],
        recommendation: String(d.recommendation || ''),
        urgency: (d.urgency as DecisionQueueItem['urgency']) || 'medium',
        status: String(d.status || 'pending'),
        created: String(d.created || ''),
      };
    });
  } catch {
    return [];
  }
}

export function writeDecisionQueue(items: DecisionQueueItem[]): void {
  const filePath = join(WORKSPACE_ROOT, 'decision-queue.json');
  writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
}
