/**
 * Knowledge Sync — Bidirectional sync between knowledge_entries (SQLite) and spo_fact (TypeDB)
 *
 * Mapping:
 *   title       → subject
 *   category    → predicate
 *   content     → object_value
 *   confidence  → confidence
 */

import { getTypeDBClient, TypeDBUnavailableError } from './client';
import { MCFactQueries, parseAnswers, extractVar, extractNum } from './queries';

// ── Types ───────────────────────────────────────────────────────────────

interface KnowledgeEntry {
  id: string;
  workspace_id: string;
  task_id?: string | null;
  category: string;
  title: string;
  content: string;
  tags?: string | null;
  confidence: number;
  created_by_agent_id?: string | null;
  created_at?: string;
}

interface TypeDBFact {
  uid: string;
  subject: string;
  predicate: string;
  objectValue: string;
  confidence: number;
  createdAt: string;
}

// ── Agent UID Mapping ────────────────────────────────────────────────────

/** Map MC agent IDs (mabos-*) to TypeDB agent UIDs (vw-*). */
const MC_TO_TYPEDB_AGENT: Record<string, string> = {
  'mabos-ceo': 'vw-ceo',
  'mabos-cfo': 'vw-cfo',
  'mabos-cmo': 'vw-cmo',
  'mabos-cto': 'vw-cto',
  'mabos-coo': 'vw-coo',
  'mabos-legal': 'vw-legal',
  'mabos-compliance-director': 'vw-compliance-director',
  'mabos-creative-director': 'vw-creative-director',
};

function resolveTypeDBAgentUid(mcAgentId: string | null | undefined, workspaceId: string): string {
  if (mcAgentId && MC_TO_TYPEDB_AGENT[mcAgentId]) {
    return MC_TO_TYPEDB_AGENT[mcAgentId];
  }
  // Fallback: use vw-knowledge as default agent for unmatched IDs
  return 'vw-knowledge';
}

// ── Write-Through ───────────────────────────────────────────────────────

/**
 * Write a knowledge entry to TypeDB as an SPO fact.
 * Fire-and-forget safe — callers should .catch() errors.
 */
export async function writeKnowledgeToTypeDB(entry: KnowledgeEntry): Promise<void> {
  const client = getTypeDBClient();

  // Ensure connection is established before checking availability
  if (!client.isAvailable()) {
    await client.connect();
  }
  if (!client.isAvailable()) {
    throw new TypeDBUnavailableError();
  }

  // Map MC agent ID to TypeDB agent UID
  const agentUid = resolveTypeDBAgentUid(entry.created_by_agent_id, entry.workspace_id);

  const typeql = MCFactQueries.insertKnowledgeFact({
    uid: `ke-${entry.id}`,
    agentUid,
    subject: entry.title,
    predicate: entry.category,
    objectValue: entry.content,
    confidence: entry.confidence,
    source: 'mission-control',
  });

  await client.insertData(typeql);
}

// ── Sync From TypeDB ────────────────────────────────────────────────────

/**
 * Query facts from TypeDB and return them as knowledge entry shapes.
 * Caller is responsible for upserting into SQLite.
 */
export async function syncKnowledgeFromTypeDB(
  agentUid: string,
  filters?: { predicate?: string },
): Promise<TypeDBFact[]> {
  const client = getTypeDBClient();
  if (!client.isAvailable()) {
    throw new TypeDBUnavailableError();
  }

  const typeql = MCFactQueries.queryFacts(agentUid, filters);
  const result = await client.matchQuery(typeql);

  if (!result) return [];

  const answers = parseAnswers(result);
  return answers.map((answer) => ({
    uid: extractVar(answer.data, 'uid'),
    subject: extractVar(answer.data, 'subj'),
    predicate: extractVar(answer.data, 'pred'),
    objectValue: extractVar(answer.data, 'obj'),
    confidence: extractNum(answer.data, 'conf'),
    createdAt: extractVar(answer.data, 'cat'),
  }));
}

/**
 * Map a TypeDB fact back to a knowledge entry shape for SQLite upsert.
 */
export function factToKnowledgeEntry(
  fact: TypeDBFact,
  workspaceId: string,
): Partial<KnowledgeEntry> {
  return {
    id: fact.uid.replace(/^ke-/, ''),
    workspace_id: workspaceId,
    category: fact.predicate,
    title: fact.subject,
    content: fact.objectValue,
    confidence: fact.confidence,
    created_at: fact.createdAt,
  };
}
