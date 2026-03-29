/**
 * TypeDB Query Builders — Only what MC needs
 *
 * Lightweight query builders for reading goals and writing/reading SPO facts.
 * All queries use agent_owns scoping pattern from OpenClaw.
 *
 * TypeDB 3.x uses `match` (no `fetch` clause). Response is conceptRows
 * where each answer.data maps variable names → {kind, value, valueType}.
 */

// ── Response Parsing ────────────────────────────────────────────────────

interface TypeDBConceptRow {
  data: Record<string, { kind: string; value?: unknown; valueType?: string; iid?: string }>;
}

interface TypeDBQueryResponse {
  queryType: string;
  answerType: string;
  answers: TypeDBConceptRow[];
}

/** Extract a scalar value from a TypeDB concept row by variable name. */
export function extractVar(row: TypeDBConceptRow['data'], varName: string): string {
  const v = row[varName];
  if (!v) return '';
  if (v.value !== undefined) return String(v.value);
  return '';
}

/** Extract a numeric value from a TypeDB concept row. */
export function extractNum(row: TypeDBConceptRow['data'], varName: string): number {
  const v = row[varName];
  if (!v || v.value === undefined) return 0;
  return Number(v.value);
}

/** Parse answers from a TypeDB query response. */
export function parseAnswers(result: unknown): TypeDBConceptRow[] {
  const r = result as TypeDBQueryResponse;
  return r?.answers ?? [];
}

// ── Goal Queries ────────────────────────────────────────────────────────

export const MCGoalQueries = {
  /**
   * Fetch all goals, optionally filtered by hierarchy_level.
   * Binds: $uid, $name, $desc, $hl, $priority, $agent_uid
   * Optional attributes (deadline, parent_goal_id, etc.) need separate queries
   * because TypeDB match requires all bound attributes to exist.
   */
  fetchGoals(hierarchyLevel?: string): string {
    const filter = hierarchyLevel
      ? `\n    has hierarchy_level "${hierarchyLevel}",`
      : '\n    has hierarchy_level $hl,';
    return `match
  $g isa goal,
    has uid $uid,
    has name $name,
    has description $desc,${filter}
    has priority $priority;
  (owner: $a, owned: $g) isa agent_owns;
  $a has uid $agent_uid;`;
  },

  /**
   * Fetch goals with parent_goal_id (tactical + operational only).
   * Strategic goals don't have parent_goal_id so they won't match.
   */
  fetchGoalsWithParent(): string {
    return `match
  $g isa goal,
    has uid $uid,
    has name $name,
    has description $desc,
    has hierarchy_level $hl,
    has priority $priority,
    has parent_goal_id $pid;
  (owner: $a, owned: $g) isa agent_owns;
  $a has uid $agent_uid;`;
  },

  /** Count all goals. */
  countGoals(): string {
    return 'match $g isa goal; reduce $count = count;';
  },
};

// ── Fact Queries ────────────────────────────────────────────────────────

export const MCFactQueries = {
  /**
   * Insert a knowledge entry as an SPO fact scoped to an agent.
   * Maps: title→subject, category→predicate, content→object_value, confidence→confidence
   */
  insertKnowledgeFact(params: {
    uid: string;
    agentUid: string;
    subject: string;
    predicate: string;
    objectValue: string;
    confidence: number;
    source?: string;
  }): string {
    const escaped = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `match
  $a isa agent, has uid "${escaped(params.agentUid)}";
insert
  $f isa spo_fact,
    has uid "${escaped(params.uid)}",
    has subject "${escaped(params.subject)}",
    has predicate "${escaped(params.predicate)}",
    has object_value "${escaped(params.objectValue)}",
    has confidence ${params.confidence},
    has source "${escaped(params.source || 'mission-control')}",
    has created_at "${new Date().toISOString()}";
  (owner: $a, owned: $f) isa agent_owns;`;
  },

  /**
   * Query facts for a given agent, optionally filtered by predicate (category).
   */
  queryFacts(agentUid: string, filters?: { predicate?: string }): string {
    const escaped = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const clauses = [
      '$f isa spo_fact,',
      '  has uid $uid,',
      '  has subject $subj,',
      '  has predicate $pred,',
      '  has object_value $obj,',
      '  has confidence $conf,',
      '  has created_at $cat;',
      `$a isa agent, has uid "${escaped(agentUid)}";`,
      '(owner: $a, owned: $f) isa agent_owns;',
    ];

    if (filters?.predicate) {
      clauses.push(`$pred = "${escaped(filters.predicate)}";`);
    }

    return `match\n  ${clauses.join('\n  ')}`;
  },

  /** Count all SPO facts. */
  countFacts(): string {
    return 'match $f isa spo_fact; reduce $count = count;';
  },
};
