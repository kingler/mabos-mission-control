'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, FileText, RefreshCw, Brain, Activity, Target, BookOpen,
  Lightbulb, Zap, ListTodo, ChevronDown, ChevronRight, ArrowLeft,
  AlertTriangle, Maximize2, Minimize2,
} from 'lucide-react';
import { CognitiveActivityFeed } from './CognitiveActivityFeed';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'bdi' | 'goals' | 'memory' | 'knowledge' | 'skills' | 'tasks' | 'activity';

interface AgentDetailPanelProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

interface AgentFile {
  filename: string;
  category: string;
  size: number;
  modified: string;
}

interface BdiDetail {
  beliefCount: number;
  desireCount: number;
  goalCount: number;
  intentionCount: number;
  beliefs: string[];
  desires: string[];
  goals: string[];
  intentions: string[];
}

interface ParsedSkill {
  id: string;
  name: string;
  description: string;
  tools: string;
  status: string;
}

// ─── File Classification ─────────────────────────────────────────────────────

const PERSONA_FILES = new Set(['persona.md', 'identity.md', 'soul.md', 'user.md']);
const BDI_FILES = new Set(['beliefs.md', 'desires.md', 'intentions.md', 'plans.md']);
const KNOWLEDGE_FILES = new Set(['knowledge.md', 'capabilities.md', 'playbooks.md']);
const SKILL_FILES = new Set(['skill.md', 'agents.md']);
const TOOL_FILES = new Set(['tools.md', 'task.md']);

const isGoalFile = (f: AgentFile) => {
  const n = f.filename.toLowerCase();
  return n === 'goals.md' || n.startsWith('goals_backup');
};

const isMemoryFile = (f: AgentFile) => {
  const n = f.filename.toLowerCase();
  return ['memory.md', 'actions.md', 'memory-journal.md', 'heartbeat.md'].includes(n)
    || /^memory/i.test(n)
    || /validation[_-]log/i.test(n);
};

const isReportFile = (f: AgentFile) =>
  /emergency|briefing|report|status|implementation|resolution|protocol|roadmap|assessment|escalation|fortification|infrastructure|phase2|stakeholder|testing|fix_complete|adjustment|intervention|correction|coordination|acl_protocol|responsiveness|autonomy|deployment|configuration|failure/i.test(f.filename);

const isClassified = (f: AgentFile) => {
  const n = f.filename.toLowerCase();
  return PERSONA_FILES.has(n) || BDI_FILES.has(n) || KNOWLEDGE_FILES.has(n)
    || SKILL_FILES.has(n) || TOOL_FILES.has(n) || isGoalFile(f) || isMemoryFile(f) || isReportFile(f);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseSkillTable(content: string): ParsedSkill[] {
  const skills: ParsedSkill[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\|\s*(SK-\d+)\s*\|/);
    if (!match) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    const nameMatch = cols[1]?.match(/`([^`]+)`/);
    const descParts = cols[2]?.split('—') || cols[2]?.split('-') || [cols[2]];
    skills.push({
      id: cols[0],
      name: nameMatch ? nameMatch[1] : cols[1],
      description: (descParts.length > 1 ? descParts.slice(1).join('—').trim() : descParts[0]?.trim()) || '',
      tools: cols[3] || '—',
      status: (cols[4] || 'active').toLowerCase().includes('inactive') ? 'inactive' : 'active',
    });
  }
  return skills;
}

// ─── Generic Markdown → UI Cards Parser ─────────────────────────────────────

interface MdSection {
  title: string;
  items: MdItem[];
  table?: { headers: string[]; rows: string[][] };
  bullets?: string[];
}

interface MdItem {
  title: string;
  fields: { key: string; value: string }[];
  bullets?: string[];
}

function parseMarkdownSections(content: string): MdSection[] {
  const sections: MdSection[] = [];
  const lines = content.split('\n');
  let currentSection: MdSection | null = null;
  let currentItem: MdItem | null = null;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  for (const line of lines) {
    if (/^# [^#]/.test(line)) continue;

    if (/^## /.test(line)) {
      if (currentItem && currentSection) currentSection.items.push(currentItem);
      if (currentSection) {
        if (inTable) { currentSection.table = { headers: tableHeaders, rows: tableRows }; inTable = false; tableHeaders = []; tableRows = []; }
        sections.push(currentSection);
      }
      currentSection = { title: line.replace(/^## /, '').trim(), items: [] };
      currentItem = null;
      continue;
    }

    if (/^### /.test(line)) {
      if (currentItem && currentSection) currentSection.items.push(currentItem);
      currentItem = { title: line.replace(/^### /, '').trim(), fields: [] };
      continue;
    }

    if (!currentSection) continue;

    if (/^\|.*\|/.test(line)) {
      if (/^\|[-\s|:]+\|$/.test(line)) continue;
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (!inTable) { inTable = true; tableHeaders = cells; } else { tableRows.push(cells); }
      continue;
    } else if (inTable) {
      if (currentSection) currentSection.table = { headers: tableHeaders, rows: tableRows };
      inTable = false; tableHeaders = []; tableRows = [];
    }

    const kvMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (kvMatch) {
      const field = { key: kvMatch[1].trim(), value: kvMatch[2].trim() };
      if (currentItem) currentItem.fields.push(field);
      else {
        if (!currentSection.items.length || currentSection.items[currentSection.items.length - 1].title !== '') {
          currentSection.items.push({ title: '', fields: [field] });
        } else {
          currentSection.items[currentSection.items.length - 1].fields.push(field);
        }
      }
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.+)/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (currentItem) {
        if (!currentItem.bullets) currentItem.bullets = [];
        currentItem.bullets.push(text);
      } else {
        if (!currentSection.bullets) currentSection.bullets = [];
        currentSection.bullets.push(text);
      }
      continue;
    }

    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (!currentSection.bullets) currentSection.bullets = [];
      currentSection.bullets.push(numMatch[1].trim());
    }
  }

  if (currentItem && currentSection) currentSection.items.push(currentItem);
  if (currentSection) {
    if (inTable) currentSection.table = { headers: tableHeaders, rows: tableRows };
    sections.push(currentSection);
  }
  return sections;
}

// ─── Generic Markdown Cards Renderer (fallback) ─────────────────────────────

function RenderedMarkdown({ content }: { content: string }) {
  if (!content || content.startsWith('(')) {
    return <p className="text-xs text-mc-text-secondary italic">{content || '(Empty)'}</p>;
  }

  const sections = parseMarkdownSections(content);
  if (sections.length === 0) {
    return (
      <pre className="bg-mc-bg p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border max-h-60">
        {content}
      </pre>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((sec, si) => (
        <div key={si} className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">{sec.title}</h5>
          </div>
          <div className="px-3 py-2 space-y-2">
            {sec.bullets && sec.bullets.length > 0 && (
              <ul className="space-y-1">
                {sec.bullets.map((b, bi) => (
                  <li key={bi} className="text-xs text-mc-text flex items-start gap-1.5">
                    <span className="text-mc-text-secondary mt-1 text-[8px]">&#9679;</span>
                    <span dangerouslySetInnerHTML={{ __html: b.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
                  </li>
                ))}
              </ul>
            )}
            {sec.table && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-mc-border">
                      {sec.table.headers.map((h, hi) => (
                        <th key={hi} className="text-left py-1.5 px-2 text-mc-text-secondary font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sec.table.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-mc-border/30 last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="py-1.5 px-2">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sec.items.map((item, ii) => (
              <div key={ii} className={item.title ? 'bg-mc-bg-tertiary/50 rounded-md p-2.5 border border-mc-border/30' : ''}>
                {item.title && <div className="text-sm font-medium mb-1.5">{item.title}</div>}
                {item.fields.length > 0 && (
                  <div className="space-y-0.5">
                    {item.fields.map((f, fi) => (
                      <div key={fi} className="flex gap-2 text-xs">
                        <span className="text-mc-text-secondary font-medium shrink-0">{f.key}:</span>
                        <span className="text-mc-text">{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {item.bullets && item.bullets.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {item.bullets.map((b, bi) => (
                      <li key={bi} className="text-xs text-mc-text-secondary flex items-start gap-1.5">
                        <span className="mt-1 text-[8px]">&#9679;</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function parseBig5(content: string): { trait: string; score: number }[] {
  const traits: { trait: string; score: number }[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/(Openness|Conscientiousness|Extraversion|Agreeableness|Neuroticism)[^:]*:\s*([\d.]+)/i);
    if (m) traits.push({ trait: m[1], score: parseFloat(m[2]) });
  }
  return traits;
}

// ─── File-Type-Specific Parsed Types ────────────────────────────────────────

interface ParsedDesire {
  id: string;
  name: string;
  description: string;
  type: string;
  priorityScore: number;
  basePriority: number;
  importance: number;
  urgency: number;
  strategicAlignment: number;
  dependencyStatus: number;
  generatesGoals: string;
  conflictsWith: string;
  conflictResolution: string;
}

interface ParsedGoal {
  id: string;
  name: string;
  source: string;
  type: string;
  status: string;
  parent: string;
  kpi: string;
  target: string;
  dependencies: string;
  kind: 'delegated' | 'subgoal';
}

interface ParsedIntention {
  id: string;
  name: string;
  goal: string;
  plan: string;
  status: string;
  adopted: string;
  reason: string;
  section: 'active' | 'suspended' | 'completed';
}

interface ParsedPlan {
  id: string;
  name: string;
  intention: string;
  template: string;
  status: string;
  started: string;
  steps: { text: string; status: 'pending' | 'complete' | 'in_progress' }[];
}

interface ParsedBeliefSection {
  title: string;
  items: { key: string; value: string }[];
  bullets: string[];
}

interface ParsedPersona {
  topFields: { key: string; value: string }[];
  sections: {
    title: string;
    prose: string;
    subsections: { title: string; items: { key: string; value: string }[]; bullets: string[] }[];
    bullets: string[];
  }[];
}

interface ParsedPlaybook {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
}

interface ParsedEvent {
  date: string;
  eventName: string;
  fields: { key: string; value: string }[];
}

interface ParsedAction {
  timestamp: string;
  tool: string;
  task: string;
  outcome: string;
  summary: string;
}

interface ParsedCapabilityGroup {
  category: string;
  subcategories: { name: string; capabilities: { name: string; description: string }[] }[];
}

// ─── File-Type-Specific Parsers ─────────────────────────────────────────────

function parseFieldValue(lines: string[], startIdx: number, key: string): string {
  for (let i = startIdx; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^-?\\s*\\*\\*${key}:?\\*\\*:?\\s*(.*)`, 'i'));
    if (m) return m[1].trim();
  }
  return '';
}

function parseDesires(content: string): { desires: ParsedDesire[]; hierarchy: string[]; logTable?: { headers: string[]; rows: string[][] } } {
  const desires: ParsedDesire[] = [];
  const hierarchy: string[] = [];
  let logTable: { headers: string[]; rows: string[][] } | undefined;
  const lines = content.split('\n');
  let currentDesire: Partial<ParsedDesire> | null = null;
  let inHierarchy = false;
  let inLogTable = false;
  let logHeaders: string[] = [];
  const logRows: string[][] = [];
  let inPriorityBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Desire Hierarchy section
    if (/^## Desire Hierarchy/i.test(line)) { inHierarchy = true; continue; }
    if (/^## Desire Adoption/i.test(line)) { inHierarchy = false; inLogTable = true; continue; }
    if (/^## /.test(line) && !/Desire Hierarchy|Desire Adoption/i.test(line)) {
      inHierarchy = false;
      inLogTable = false;
    }

    if (inHierarchy) {
      const numMatch = line.match(/^\d+\.\s+(.+)/);
      if (numMatch) hierarchy.push(numMatch[1].trim());
      continue;
    }

    if (inLogTable) {
      if (/^\|.*\|/.test(line)) {
        if (/^\|[-\s|:]+\|$/.test(line)) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (logHeaders.length === 0) logHeaders = cells;
        else logRows.push(cells);
      }
      continue;
    }

    // New desire block
    const desireMatch = line.match(/^### (D-\d+):\s*(.+)/);
    if (desireMatch) {
      if (currentDesire && currentDesire.id) {
        desires.push(currentDesire as ParsedDesire);
      }
      currentDesire = {
        id: desireMatch[1], name: desireMatch[2].trim(),
        description: '', type: '', priorityScore: 0, basePriority: 0,
        importance: 0, urgency: 0, strategicAlignment: 0, dependencyStatus: 0,
        generatesGoals: '', conflictsWith: '', conflictResolution: '',
      };
      inPriorityBlock = false;
      continue;
    }

    if (!currentDesire) continue;

    // Field parsing within a desire block
    const fieldMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const val = fieldMatch[2].trim();

      if (key === 'description') currentDesire.description = val;
      else if (key === 'type') currentDesire.type = val;
      else if (key === 'priority score') { currentDesire.priorityScore = parseFloat(val) || 0; inPriorityBlock = true; }
      else if (key === 'generates goals') currentDesire.generatesGoals = val;
      else if (key === 'conflicts with') currentDesire.conflictsWith = val;
      else if (key === 'conflict resolution') currentDesire.conflictResolution = val;
      else if (inPriorityBlock) {
        if (key === 'base priority') currentDesire.basePriority = parseFloat(val) || 0;
        else if (key === 'importance') currentDesire.importance = parseFloat(val) || 0;
        else if (key === 'urgency') currentDesire.urgency = parseFloat(val) || 0;
        else if (key === 'strategic alignment') currentDesire.strategicAlignment = parseFloat(val) || 0;
        else if (key === 'dependency status') currentDesire.dependencyStatus = parseFloat(val) || 0;
      }
      continue;
    }

    // Non-field line resets priority block
    if (line.trim() && !line.startsWith('  ') && !line.startsWith('-')) {
      inPriorityBlock = false;
    }
  }

  if (currentDesire && currentDesire.id) desires.push(currentDesire as ParsedDesire);
  if (logHeaders.length > 0) logTable = { headers: logHeaders, rows: logRows };

  // Sort by priority score descending
  desires.sort((a, b) => b.priorityScore - a.priorityScore);
  return { desires, hierarchy, logTable };
}

function parseGoals(content: string): ParsedGoal[] {
  const goals: ParsedGoal[] = [];
  const lines = content.split('\n');
  let currentGoal: Partial<ParsedGoal> | null = null;
  let currentKind: 'delegated' | 'subgoal' = 'delegated';

  for (const line of lines) {
    if (/^## Delegated Goals/i.test(line)) { currentKind = 'delegated'; continue; }
    if (/^## Decomposed Sub-Goals/i.test(line)) { currentKind = 'subgoal'; continue; }

    const goalMatch = line.match(/^### ((?:DG|G)-[\w-]+):\s*(.+)/);
    if (goalMatch) {
      if (currentGoal && currentGoal.id) goals.push(currentGoal as ParsedGoal);
      currentGoal = {
        id: goalMatch[1], name: goalMatch[2].trim(), kind: currentKind,
        source: '', type: '', status: '', parent: '', kpi: '', target: '', dependencies: '',
      };
      continue;
    }

    if (!currentGoal) continue;

    const fieldMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const val = fieldMatch[2].trim();
      if (key === 'source') currentGoal.source = val;
      else if (key === 'type') currentGoal.type = val;
      else if (key === 'status') currentGoal.status = val;
      else if (key === 'parent') currentGoal.parent = val;
      else if (key === 'kpi') currentGoal.kpi = val;
      else if (key === 'target') currentGoal.target = val;
      else if (key === 'dependencies') currentGoal.dependencies = val;
    }
  }

  if (currentGoal && currentGoal.id) goals.push(currentGoal as ParsedGoal);
  return goals;
}

function parseIntentions(content: string): ParsedIntention[] {
  const intentions: ParsedIntention[] = [];
  const lines = content.split('\n');
  let currentIntention: Partial<ParsedIntention> | null = null;
  let currentSection: 'active' | 'suspended' | 'completed' = 'active';

  for (const line of lines) {
    if (/^## Active Intentions/i.test(line)) { currentSection = 'active'; continue; }
    if (/^## Suspended Intentions/i.test(line)) { currentSection = 'suspended'; continue; }
    if (/^## Completed Intentions/i.test(line)) { currentSection = 'completed'; continue; }

    const intMatch = line.match(/^### (INT-[\w-]+):\s*(.+)/);
    if (intMatch) {
      if (currentIntention && currentIntention.id) intentions.push(currentIntention as ParsedIntention);
      currentIntention = {
        id: intMatch[1], name: intMatch[2].trim(), section: currentSection,
        goal: '', plan: '', status: '', adopted: '', reason: '',
      };
      continue;
    }

    if (!currentIntention) continue;

    const fieldMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const val = fieldMatch[2].trim();
      if (key === 'goal') currentIntention.goal = val;
      else if (key === 'plan') currentIntention.plan = val;
      else if (key === 'status') currentIntention.status = val;
      else if (key === 'adopted') currentIntention.adopted = val;
      else if (key === 'reason') currentIntention.reason = val;
    }
  }

  if (currentIntention && currentIntention.id) intentions.push(currentIntention as ParsedIntention);
  return intentions;
}

function parsePlans(content: string): ParsedPlan[] {
  const plans: ParsedPlan[] = [];
  const lines = content.split('\n');
  let currentPlan: Partial<ParsedPlan> | null = null;
  let inSteps = false;

  for (const line of lines) {
    const planMatch = line.match(/^### (P-[\w-]+):\s*(.+)/);
    if (planMatch) {
      if (currentPlan && currentPlan.id) plans.push(currentPlan as ParsedPlan);
      currentPlan = {
        id: planMatch[1], name: planMatch[2].trim(),
        intention: '', template: '', status: '', started: '', steps: [],
      };
      inSteps = false;
      continue;
    }

    if (/^####\s+Steps/i.test(line)) { inSteps = true; continue; }
    if (/^###\s/.test(line) || /^##\s/.test(line)) { inSteps = false; continue; }

    if (!currentPlan) continue;

    if (inSteps) {
      const stepMatch = line.match(/^\d+\.\s+(.+)/);
      if (stepMatch) {
        const text = stepMatch[1].trim();
        let status: 'pending' | 'complete' | 'in_progress' = 'pending';
        if (/\[complete\]/i.test(text)) status = 'complete';
        else if (/\[in_progress\]/i.test(text)) status = 'in_progress';
        currentPlan.steps!.push({
          text: text.replace(/\[(pending|complete|in_progress)\]/gi, '').trim(),
          status,
        });
      }
      continue;
    }

    const fieldMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const val = fieldMatch[2].trim();
      if (key === 'intention') currentPlan.intention = val;
      else if (key === 'template') currentPlan.template = val;
      else if (key === 'status') currentPlan.status = val;
      else if (key === 'started') currentPlan.started = val;
    }
  }

  if (currentPlan && currentPlan.id) plans.push(currentPlan as ParsedPlan);
  return plans;
}

function parseBeliefs(content: string): ParsedBeliefSection[] {
  const sections: ParsedBeliefSection[] = [];
  const lines = content.split('\n');
  let currentSection: ParsedBeliefSection | null = null;

  for (const line of lines) {
    if (/^# [^#]/.test(line)) continue;

    if (/^## /.test(line)) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.replace(/^## /, '').trim(), items: [], bullets: [] };
      continue;
    }

    if (!currentSection) continue;

    const kvMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (kvMatch) {
      currentSection.items.push({ key: kvMatch[1].trim(), value: kvMatch[2].trim() });
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.+)/);
    if (bulletMatch) {
      currentSection.bullets.push(bulletMatch[1].trim());
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

function parsePersona(content: string): ParsedPersona {
  const result: ParsedPersona = { topFields: [], sections: [] };
  const lines = content.split('\n');
  let currentSection: ParsedPersona['sections'][0] | null = null;
  let currentSubsection: { title: string; items: { key: string; value: string }[]; bullets: string[] } | null = null;
  let proseLines: string[] = [];

  for (const line of lines) {
    if (/^# [^#]/.test(line)) continue;

    if (/^## /.test(line)) {
      // Flush subsection
      if (currentSubsection && currentSection) currentSection.subsections.push(currentSubsection);
      if (currentSection) {
        if (proseLines.length > 0) currentSection.prose = proseLines.join(' ').trim();
        result.sections.push(currentSection);
      }
      currentSection = { title: line.replace(/^## /, '').trim(), prose: '', subsections: [], bullets: [] };
      currentSubsection = null;
      proseLines = [];
      continue;
    }

    if (/^### /.test(line)) {
      if (currentSubsection && currentSection) currentSection.subsections.push(currentSubsection);
      if (proseLines.length > 0 && currentSection) {
        currentSection.prose = proseLines.join(' ').trim();
        proseLines = [];
      }
      currentSubsection = { title: line.replace(/^### /, '').trim(), items: [], bullets: [] };
      continue;
    }

    // Top-level fields (before any ## section)
    if (!currentSection) {
      const kvMatch = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
      if (kvMatch) {
        result.topFields.push({ key: kvMatch[1].trim(), value: kvMatch[2].trim() });
      }
      const kvDash = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
      if (kvDash) {
        result.topFields.push({ key: kvDash[1].trim(), value: kvDash[2].trim() });
      }
      continue;
    }

    // Within sections
    const kvMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (kvMatch) {
      const field = { key: kvMatch[1].trim(), value: kvMatch[2].trim() };
      if (currentSubsection) currentSubsection.items.push(field);
      continue;
    }

    const bulletMatch = line.match(/^-\s+(.+)/);
    if (bulletMatch) {
      const text = bulletMatch[1].trim();
      if (currentSubsection) currentSubsection.bullets.push(text);
      else if (currentSection) currentSection.bullets.push(text);
      continue;
    }

    // Prose paragraph text
    if (line.trim() && !line.startsWith('#') && !line.startsWith('|') && currentSection && !currentSubsection) {
      proseLines.push(line.trim());
    }
  }

  if (currentSubsection && currentSection) currentSection.subsections.push(currentSubsection);
  if (currentSection) {
    if (proseLines.length > 0) currentSection.prose = proseLines.join(' ').trim();
    result.sections.push(currentSection);
  }
  return result;
}

function parsePlaybooks(content: string): ParsedPlaybook[] {
  const playbooks: ParsedPlaybook[] = [];
  const lines = content.split('\n');
  let current: Partial<ParsedPlaybook> | null = null;

  for (const line of lines) {
    const pbMatch = line.match(/^## (PB-[\w-]+):\s*(.+)/);
    if (pbMatch) {
      if (current && current.id) playbooks.push(current as ParsedPlaybook);
      current = { id: pbMatch[1], name: pbMatch[2].trim(), trigger: '', steps: [] };
      continue;
    }

    if (!current) continue;

    const triggerMatch = line.match(/^\*\*Trigger:?\*\*:?\s*(.*)/);
    if (triggerMatch) { current.trigger = triggerMatch[1].trim(); continue; }

    const stepMatch = line.match(/^\d+\.\s+(.+)/);
    if (stepMatch) { current.steps!.push(stepMatch[1].trim()); }
  }

  if (current && current.id) playbooks.push(current as ParsedPlaybook);
  return playbooks;
}

function parseMemoryContent(content: string): { events: ParsedEvent[]; decisionsTable?: { headers: string[]; rows: string[][] } } {
  const events: ParsedEvent[] = [];
  let decisionsTable: { headers: string[]; rows: string[][] } | undefined;
  const lines = content.split('\n');
  let currentEvent: Partial<ParsedEvent> | null = null;
  let inDecisions = false;
  let decHeaders: string[] = [];
  const decRows: string[][] = [];

  for (const line of lines) {
    if (/^## Key Decisions/i.test(line)) { inDecisions = true; continue; }
    if (/^## /.test(line) && !/Key Decisions/i.test(line)) { inDecisions = false; }

    if (inDecisions) {
      if (/^\|.*\|/.test(line)) {
        if (/^\|[-\s|:]+\|$/.test(line)) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (decHeaders.length === 0) decHeaders = cells;
        else decRows.push(cells);
      }
      continue;
    }

    const eventMatch = line.match(/^### (.+?)\s*[—–-]\s*(.+)/);
    if (eventMatch) {
      if (currentEvent && currentEvent.date) events.push(currentEvent as ParsedEvent);
      currentEvent = { date: eventMatch[1].trim(), eventName: eventMatch[2].trim(), fields: [] };
      continue;
    }

    if (!currentEvent) continue;

    const fieldMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (fieldMatch) {
      currentEvent.fields!.push({ key: fieldMatch[1].trim(), value: fieldMatch[2].trim() });
    }
  }

  if (currentEvent && currentEvent.date) events.push(currentEvent as ParsedEvent);
  if (decHeaders.length > 0) decisionsTable = { headers: decHeaders, rows: decRows };
  return { events, decisionsTable };
}

function parseActions(content: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const lines = content.split('\n');
  let headers: string[] = [];
  let foundHeaders = false;

  for (const line of lines) {
    if (!/^\|.*\|/.test(line)) continue;
    if (/^\|[-\s|:]+\|$/.test(line)) continue;
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (!foundHeaders) {
      headers = cells.map(h => h.toLowerCase());
      foundHeaders = true;
      continue;
    }
    const tsIdx = headers.findIndex(h => /timestamp|time|date/i.test(h));
    const toolIdx = headers.findIndex(h => /tool/i.test(h));
    const taskIdx = headers.findIndex(h => /task/i.test(h));
    const outcomeIdx = headers.findIndex(h => /outcome|result|status/i.test(h));
    const summaryIdx = headers.findIndex(h => /summary|description|detail/i.test(h));

    actions.push({
      timestamp: cells[tsIdx >= 0 ? tsIdx : 0] || '',
      tool: cells[toolIdx >= 0 ? toolIdx : 1] || '',
      task: cells[taskIdx >= 0 ? taskIdx : 2] || '',
      outcome: cells[outcomeIdx >= 0 ? outcomeIdx : 3] || '',
      summary: cells[summaryIdx >= 0 ? summaryIdx : 4] || '',
    });
  }
  return actions;
}

function parseCapabilities(content: string): ParsedCapabilityGroup[] {
  const groups: ParsedCapabilityGroup[] = [];
  const lines = content.split('\n');
  let currentGroup: ParsedCapabilityGroup | null = null;
  let currentSub: { name: string; capabilities: { name: string; description: string }[] } | null = null;

  for (const line of lines) {
    if (/^# [^#]/.test(line)) continue;

    if (/^## /.test(line)) {
      if (currentSub && currentGroup) currentGroup.subcategories.push(currentSub);
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { category: line.replace(/^## /, '').trim(), subcategories: [] };
      currentSub = null;
      continue;
    }

    if (/^### /.test(line)) {
      if (currentSub && currentGroup) currentGroup.subcategories.push(currentSub);
      currentSub = { name: line.replace(/^### /, '').trim(), capabilities: [] };
      continue;
    }

    if (!currentGroup) continue;

    const capMatch = line.match(/^-\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    if (capMatch) {
      const cap = { name: capMatch[1].trim(), description: capMatch[2].trim() };
      if (currentSub) currentSub.capabilities.push(cap);
      else {
        // No subcategory — create implicit one
        if (!currentGroup.subcategories.length) {
          currentGroup.subcategories.push({ name: '', capabilities: [] });
        }
        currentGroup.subcategories[currentGroup.subcategories.length - 1].capabilities.push(cap);
      }
    }
  }

  if (currentSub && currentGroup) currentGroup.subcategories.push(currentSub);
  if (currentGroup) groups.push(currentGroup);
  return groups;
}

// ─── File-Type-Specific Renderers ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const color = s.includes('active') || s === 'success' || s === 'complete' || s === 'completed'
    ? 'bg-green-500/20 text-green-400'
    : s.includes('suspend') || s === 'pending' || s.includes('progress')
    ? 'bg-yellow-500/20 text-yellow-400'
    : s.includes('fail') || s.includes('error') || s.includes('drop')
    ? 'bg-red-500/20 text-red-400'
    : 'bg-mc-bg-tertiary text-mc-text-secondary';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>
      {status}
    </span>
  );
}

function ScoreBar({ value, max = 10, label, compact = false }: { value: number; max?: number; label?: string; compact?: boolean }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'mb-0.5'}`}>
      {label && <span className="text-[10px] text-mc-text-secondary w-24 shrink-0">{label}</span>}
      <div className="flex-1 h-1.5 bg-mc-bg rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-mc-text-secondary w-6 text-right">{value}</span>
    </div>
  );
}

function DesiresRenderer({ content }: { content: string }) {
  const { desires, hierarchy, logTable } = parseDesires(content);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (desires.length === 0) return <RenderedMarkdown content={content} />;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {desires.map(d => (
        <div key={d.id} className="border border-mc-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleExpand(d.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-mc-bg hover:bg-mc-bg-tertiary transition-colors text-left"
          >
            {expandedIds.has(d.id)
              ? <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary" />
              : <ChevronRight className="w-3.5 h-3.5 text-mc-text-secondary" />}
            <span className="text-[10px] font-mono text-mc-text-secondary">{d.id}</span>
            <span className="text-sm font-medium flex-1 truncate">{d.name}</span>
            {d.type && <StatusBadge status={d.type} />}
            <span className="text-xs font-bold text-mc-accent">{d.priorityScore}</span>
          </button>
          <div className="px-3 pb-1">
            <ScoreBar value={d.priorityScore} max={10} />
          </div>
          {expandedIds.has(d.id) && (
            <div className="px-3 pb-3 space-y-2 border-t border-mc-border/30 pt-2">
              {d.description && <p className="text-xs text-mc-text">{d.description}</p>}
              <div className="space-y-0.5">
                <ScoreBar value={d.basePriority} max={10} label="Base Priority" compact />
                <ScoreBar value={d.importance} max={10} label="Importance" compact />
                <ScoreBar value={d.urgency} max={10} label="Urgency" compact />
                <ScoreBar value={d.strategicAlignment} max={10} label="Strategic Align" compact />
                <ScoreBar value={d.dependencyStatus} max={10} label="Dependency" compact />
              </div>
              {d.generatesGoals && (
                <div className="text-xs"><span className="text-mc-text-secondary font-medium">Generates Goals:</span> {d.generatesGoals}</div>
              )}
              {d.conflictsWith && (
                <div className="text-xs"><span className="text-mc-text-secondary font-medium">Conflicts With:</span> {d.conflictsWith}</div>
              )}
              {d.conflictResolution && (
                <div className="text-xs"><span className="text-mc-text-secondary font-medium">Resolution:</span> {d.conflictResolution}</div>
              )}
            </div>
          )}
        </div>
      ))}

      {hierarchy.length > 0 && (
        <div className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">Desire Hierarchy</h5>
          </div>
          <ol className="px-3 py-2 space-y-1 list-decimal list-inside">
            {hierarchy.map((h, i) => (
              <li key={i} className="text-xs text-mc-text">{h}</li>
            ))}
          </ol>
        </div>
      )}

      {logTable && (
        <div className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">Adoption/Drop Log</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-mc-border">
                  {logTable.headers.map((h, i) => (
                    <th key={i} className="text-left py-1.5 px-2 text-mc-text-secondary font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logTable.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-mc-border/30 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-1.5 px-2">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalsRenderer({ content }: { content: string }) {
  const goals = parseGoals(content);
  // Only show agent-specific goals (G-{ROLE}-#), not business/delegated goals (DG-#)
  const agentGoals = goals.filter(g => g.kind === 'subgoal');

  if (agentGoals.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      <div className="border border-mc-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">
            Agent Goals ({agentGoals.length})
          </h5>
        </div>
        <div className="px-3 py-2 space-y-2">
          {agentGoals.map(g => {
            // Find parent delegated goal name for context
            const parentGoal = g.parent ? goals.find(dg => dg.id === g.parent) : null;
            return (
              <div key={g.id} className="bg-mc-bg-tertiary/50 rounded-md p-2.5 border border-mc-border/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono bg-mc-accent/20 text-mc-accent px-1.5 py-0.5 rounded">{g.id}</span>
                  <span className="text-sm font-medium flex-1">{g.name}</span>
                  {g.status && <StatusBadge status={g.status} />}
                </div>
                <div className="space-y-0.5 text-xs">
                  {g.parent && (
                    <div>
                      <span className="text-mc-text-secondary font-medium">Parent:</span>{' '}
                      <span className="text-mc-accent">{g.parent}</span>
                      {parentGoal && <span className="text-mc-text-secondary"> — {parentGoal.name}</span>}
                    </div>
                  )}
                  {g.kpi && <div><span className="text-mc-text-secondary font-medium">KPI:</span> {g.kpi}</div>}
                  {g.target && <div><span className="text-mc-text-secondary font-medium">Target:</span> {g.target}</div>}
                  {g.dependencies && <div><span className="text-mc-text-secondary font-medium">Dependencies:</span> {g.dependencies}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntentionsRenderer({ content }: { content: string }) {
  const intentions = parseIntentions(content);
  if (intentions.length === 0) return <RenderedMarkdown content={content} />;

  const groups: { label: string; section: 'active' | 'suspended' | 'completed'; color: string }[] = [
    { label: 'Active', section: 'active', color: 'border-green-500/30 bg-green-500/5' },
    { label: 'Suspended', section: 'suspended', color: 'border-yellow-500/30 bg-yellow-500/5' },
    { label: 'Completed', section: 'completed', color: 'border-mc-border bg-mc-bg-tertiary/30' },
  ];

  return (
    <div className="space-y-3">
      {groups.map(grp => {
        const items = intentions.filter(i => i.section === grp.section);
        if (items.length === 0) return null;
        return (
          <div key={grp.section} className="border border-mc-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">
                {grp.label} Intentions ({items.length})
              </h5>
            </div>
            <div className="px-3 py-2 space-y-2">
              {items.map(intent => (
                <div key={intent.id} className={`rounded-md p-2.5 border ${grp.color}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-mc-text-secondary">{intent.id}</span>
                    <span className="text-sm font-medium flex-1">{intent.name}</span>
                    <StatusBadge status={intent.status || grp.label} />
                  </div>
                  <div className="space-y-0.5 text-xs">
                    {intent.goal && <div><span className="text-mc-text-secondary font-medium">Goal:</span> {intent.goal}</div>}
                    {intent.plan && <div><span className="text-mc-text-secondary font-medium">Plan:</span> {intent.plan}</div>}
                    {intent.adopted && <div><span className="text-mc-text-secondary font-medium">Adopted:</span> {intent.adopted}</div>}
                    {intent.reason && <div><span className="text-mc-text-secondary font-medium">Reason:</span> {intent.reason}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlansRenderer({ content }: { content: string }) {
  const plans = parsePlans(content);
  if (plans.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {plans.map(plan => {
        const total = plan.steps.length;
        const completed = plan.steps.filter(s => s.status === 'complete').length;
        const inProgress = plan.steps.filter(s => s.status === 'in_progress').length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        return (
          <div key={plan.id} className="border border-mc-border rounded-lg overflow-hidden">
            <div className="px-3 py-2.5 bg-mc-bg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-mc-text-secondary">{plan.id}</span>
                <span className="text-sm font-medium flex-1">{plan.name}</span>
                <StatusBadge status={plan.status || 'active'} />
              </div>
              <div className="space-y-0.5 text-xs mb-2">
                {plan.intention && <div><span className="text-mc-text-secondary font-medium">Intention:</span> {plan.intention}</div>}
                {plan.template && <div><span className="text-mc-text-secondary font-medium">Template:</span> {plan.template}</div>}
                {plan.started && <div><span className="text-mc-text-secondary font-medium">Started:</span> {plan.started}</div>}
              </div>
              {/* Progress bar */}
              {total > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-mc-text-secondary mb-1">
                    <span>{completed}/{total} steps complete</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                    {inProgress > 0 && (
                      <div className="h-full bg-yellow-500 transition-all" style={{ width: `${Math.round((inProgress / total) * 100)}%` }} />
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Steps checklist */}
            {plan.steps.length > 0 && (
              <div className="px-3 py-2 border-t border-mc-border/30 space-y-1">
                {plan.steps.map((step, si) => (
                  <div key={si} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold shrink-0 ${
                      step.status === 'complete' ? 'bg-green-500/20 text-green-400' :
                      step.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-mc-bg-tertiary text-mc-text-secondary'
                    }`}>
                      {step.status === 'complete' ? '✓' : step.status === 'in_progress' ? '▸' : (si + 1)}
                    </span>
                    <span className={step.status === 'complete' ? 'line-through text-mc-text-secondary' : ''}>{step.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BeliefsRenderer({ content }: { content: string }) {
  const sections = parseBeliefs(content);
  if (sections.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {sections.map((sec, i) => (
        <div key={i} className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">{sec.title}</h5>
          </div>
          <div className="px-3 py-2 space-y-1">
            {sec.items.map((item, ii) => (
              <div key={ii} className="flex gap-2 text-xs py-0.5">
                <span className="text-mc-text-secondary font-medium shrink-0">{item.key}:</span>
                <span className="text-mc-text">{item.value}</span>
              </div>
            ))}
            {sec.bullets.map((b, bi) => (
              <div key={bi} className="text-xs text-mc-text flex items-start gap-1.5 py-0.5">
                <span className="text-mc-text-secondary mt-1 text-[8px]">&#9679;</span>
                <span dangerouslySetInnerHTML={{ __html: b.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonaRenderer({ content }: { content: string }) {
  const persona = parsePersona(content);
  if (persona.topFields.length === 0 && persona.sections.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {/* Identity header card */}
      {persona.topFields.length > 0 && (
        <div className="border border-mc-accent/30 bg-mc-accent/5 rounded-lg p-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-accent mb-2">Identity</h5>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {persona.topFields.map((f, i) => (
              <div key={i} className="text-xs py-0.5">
                <span className="text-mc-text-secondary font-medium">{f.key}:</span>{' '}
                <span className="text-mc-text">{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {persona.sections.map((sec, si) => (
        <div key={si} className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">{sec.title}</h5>
          </div>
          <div className="px-3 py-2 space-y-2">
            {sec.prose && <p className="text-xs text-mc-text leading-relaxed">{sec.prose}</p>}
            {sec.bullets.length > 0 && (
              <ul className="space-y-1">
                {sec.bullets.map((b, bi) => (
                  <li key={bi} className="text-xs text-mc-text flex items-start gap-1.5">
                    <span className="text-mc-text-secondary mt-1 text-[8px]">&#9679;</span>
                    <span dangerouslySetInnerHTML={{ __html: b.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
                  </li>
                ))}
              </ul>
            )}
            {sec.subsections.map((sub, subi) => (
              <div key={subi} className="bg-mc-bg-tertiary/50 rounded-md p-2.5 border border-mc-border/30">
                {sub.title && <div className="text-xs font-medium mb-1.5 text-mc-text">{sub.title}</div>}
                {sub.items.map((item, ii) => (
                  <div key={ii} className="flex gap-2 text-xs py-0.5">
                    <span className="text-mc-text-secondary font-medium shrink-0">{item.key}:</span>
                    <span className="text-mc-text">{item.value}</span>
                  </div>
                ))}
                {sub.bullets.map((b, bi) => (
                  <div key={bi} className="text-xs text-mc-text flex items-start gap-1.5 py-0.5">
                    <span className="text-mc-text-secondary mt-1 text-[8px]">&#9679;</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlaybooksRenderer({ content }: { content: string }) {
  const playbooks = parsePlaybooks(content);
  if (playbooks.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {playbooks.map(pb => (
        <div key={pb.id} className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2.5 bg-mc-bg">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-mc-text-secondary">{pb.id}</span>
              <span className="text-sm font-medium flex-1">{pb.name}</span>
            </div>
            {pb.trigger && (
              <div className="inline-flex items-center gap-1 text-[10px] bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">
                <Zap className="w-2.5 h-2.5" />
                Trigger: {pb.trigger}
              </div>
            )}
          </div>
          {pb.steps.length > 0 && (
            <div className="px-3 py-2 border-t border-mc-border/30 space-y-1">
              {pb.steps.map((step, si) => (
                <div key={si} className="flex items-start gap-2 text-xs">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-mc-bg-tertiary text-mc-text-secondary text-[10px] font-bold shrink-0 mt-0.5">
                    {si + 1}
                  </span>
                  <span className="text-mc-text">{step}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MemoryRenderer({ content }: { content: string }) {
  const { events, decisionsTable } = parseMemoryContent(content);
  if (events.length === 0 && !decisionsTable) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {events.length > 0 && (
        <div className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">
              Event Log ({events.length})
            </h5>
          </div>
          <div className="px-3 py-2 space-y-2">
            {events.map((evt, i) => (
              <div key={i} className="relative pl-4 border-l-2 border-mc-accent/30 py-1">
                <div className="absolute left-[-5px] top-2 w-2 h-2 rounded-full bg-mc-accent" />
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-mc-text-secondary font-mono">{evt.date}</span>
                  <span className="text-xs font-medium">{evt.eventName}</span>
                </div>
                {evt.fields.map((f, fi) => (
                  <div key={fi} className="text-xs">
                    <span className="text-mc-text-secondary font-medium">{f.key}:</span> {f.value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {decisionsTable && (
        <div className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">Key Decisions</h5>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-mc-border">
                  {decisionsTable.headers.map((h, i) => (
                    <th key={i} className="text-left py-1.5 px-2 text-mc-text-secondary font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisionsTable.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-mc-border/30 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-1.5 px-2">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionsRenderer({ content }: { content: string }) {
  const actions = parseActions(content);
  if (actions.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="border border-mc-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">
          Action Feed ({actions.length})
        </h5>
      </div>
      <div className="max-h-[50vh] overflow-y-auto divide-y divide-mc-border/30">
        {actions.map((action, i) => {
          const outcome = action.outcome.toLowerCase();
          const outcomeColor = outcome.includes('success') || outcome.includes('complete')
            ? 'bg-green-500/20 text-green-400'
            : outcome.includes('fail') || outcome.includes('error')
            ? 'bg-red-500/20 text-red-400'
            : 'bg-mc-bg-tertiary text-mc-text-secondary';

          return (
            <div key={i} className="px-3 py-2 hover:bg-mc-bg-tertiary/30 transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-mc-text-secondary font-mono">{action.timestamp}</span>
                {action.tool && (
                  <span className="text-[10px] bg-mc-accent/15 text-mc-accent px-1.5 py-0.5 rounded font-mono">{action.tool}</span>
                )}
                {action.outcome && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${outcomeColor}`}>{action.outcome}</span>
                )}
              </div>
              <div className="text-xs text-mc-text">{action.task}</div>
              {action.summary && <div className="text-[11px] text-mc-text-secondary mt-0.5">{action.summary}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CapabilitiesRenderer({ content }: { content: string }) {
  const groups = parseCapabilities(content);
  if (groups.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => (
        <div key={gi} className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">{group.category}</h5>
          </div>
          <div className="px-3 py-2 space-y-2">
            {group.subcategories.map((sub, si) => (
              <div key={si}>
                {sub.name && <div className="text-xs font-medium text-mc-text mb-1">{sub.name}</div>}
                <div className="space-y-1">
                  {sub.capabilities.map((cap, ci) => (
                    <div key={ci} className="flex gap-2 text-xs py-0.5 bg-mc-bg-tertiary/30 rounded px-2 py-1">
                      <span className="text-mc-accent font-medium shrink-0">{cap.name}</span>
                      {cap.description && <span className="text-mc-text-secondary">{cap.description}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeRenderer({ content }: { content: string }) {
  // Reuse the generic parser but render with specialized styling
  const sections = parseMarkdownSections(content);
  if (sections.length === 0) return <RenderedMarkdown content={content} />;

  return (
    <div className="space-y-3">
      {sections.map((sec, si) => (
        <div key={si} className="border border-mc-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-mc-bg border-b border-mc-border">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">{sec.title}</h5>
          </div>
          <div className="px-3 py-2 space-y-2">
            {/* Table (for Key Metrics & Benchmarks) */}
            {sec.table && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-mc-border">
                      {sec.table.headers.map((h, hi) => (
                        <th key={hi} className="text-left py-1.5 px-2 text-mc-text-secondary font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sec.table.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-mc-border/30 last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="py-1.5 px-2">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Key-value items (for Domain Expertise) */}
            {sec.items.filter(item => item.fields.length > 0).map((item, ii) => (
              <div key={ii} className={item.title ? 'bg-mc-bg-tertiary/50 rounded-md p-2.5 border border-mc-border/30' : ''}>
                {item.title && <div className="text-xs font-medium mb-1.5 text-mc-text">{item.title}</div>}
                {item.fields.map((f, fi) => (
                  <div key={fi} className="flex gap-2 text-xs py-0.5">
                    <span className="text-mc-accent font-medium shrink-0">{f.key}:</span>
                    <span className="text-mc-text">{f.value}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Bullets (for Decision Frameworks, Cross-Agent Dependencies) */}
            {sec.bullets && sec.bullets.length > 0 && (
              <ul className="space-y-1">
                {sec.bullets.map((b, bi) => (
                  <li key={bi} className="text-xs text-mc-text flex items-start gap-1.5">
                    <span className="text-mc-accent mt-1 text-[8px]">&#9679;</span>
                    <span dangerouslySetInnerHTML={{ __html: b.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Smart File Renderer (dispatch) ─────────────────────────────────────────

function SmartFileRenderer({ filename, content }: { filename: string; content: string }) {
  const name = filename.toLowerCase();
  if (name === 'desires.md') return <DesiresRenderer content={content} />;
  if (name === 'goals.md') return <GoalsRenderer content={content} />;
  if (name === 'intentions.md') return <IntentionsRenderer content={content} />;
  if (name === 'plans.md') return <PlansRenderer content={content} />;
  if (name === 'beliefs.md') return <BeliefsRenderer content={content} />;
  if (name === 'persona.md') return <PersonaRenderer content={content} />;
  if (name === 'playbooks.md') return <PlaybooksRenderer content={content} />;
  if (name === 'memory.md') return <MemoryRenderer content={content} />;
  if (name === 'actions.md') return <ActionsRenderer content={content} />;
  if (name === 'capabilities.md') return <CapabilitiesRenderer content={content} />;
  if (name === 'knowledge.md') return <KnowledgeRenderer content={content} />;
  // Fallback
  return <RenderedMarkdown content={content} />;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CollapsibleSection({
  title, badge, defaultOpen = false, children,
}: {
  title: string; badge?: number | string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-mc-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-mc-bg hover:bg-mc-bg-tertiary transition-colors text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-mc-text-secondary" />}
        <span className="text-sm font-medium flex-1">{title}</span>
        {badge !== undefined && (
          <span className="text-[10px] bg-mc-accent/20 text-mc-accent px-1.5 py-0.5 rounded-full font-medium">{badge}</span>
        )}
      </button>
      {open && <div className="px-3 py-3 border-t border-mc-border">{children}</div>}
    </div>
  );
}

function FileCard({
  file, onClick,
}: {
  file: AgentFile; onClick: () => void;
}) {
  const isLarge = file.size > 100 * 1024;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border/50 hover:border-mc-accent/40 transition-colors text-left"
    >
      <FileText className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{file.filename}</div>
        <div className="text-xs text-mc-text-secondary">
          {formatSize(file.size)} &middot; {new Date(file.modified).toLocaleDateString()}
        </div>
      </div>
      {isLarge && (
        <span className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3" /> Large
        </span>
      )}
    </button>
  );
}

function FilePreview({
  filename, content, onBack,
}: {
  filename: string; content: string; onBack: () => void;
}) {
  const isMd = filename.toLowerCase().endsWith('.md');
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-mc-accent mb-3 hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <h4 className="font-medium mb-2 text-sm">{filename}</h4>
      {isMd ? (
        <SmartFileRenderer filename={filename} content={content} />
      ) : (
        <pre className="bg-mc-bg p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border max-h-[60vh]">
          {content}
        </pre>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AgentDetailPanel({ agentId, agentName, onClose }: AgentDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('bdi');
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ inbox: string; outbox: string }>({ inbox: '', outbox: '' });
  const [bdiDetail, setBdiDetail] = useState<BdiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Lazy-loaded content caches
  const [lazyContent, setLazyContent] = useState<Record<string, string>>({});
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[] | null>(null);
  const [big5Traits, setBig5Traits] = useState<{ trait: string; score: number }[]>([]);

  useEffect(() => {
    setSelectedFile(null);
    setFileContent(null);
    setTab('bdi');
    setLazyContent({});
    setParsedSkills(null);
    setBig5Traits([]);
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

      // Load Persona.md for Big5 sliders
      try {
        const personaRes = await fetch(`/api/mabos/agents/${agentId}/files?filename=Persona.md`);
        if (personaRes.ok) {
          const data = await personaRes.json();
          if (data.content) setBig5Traits(parseBig5(data.content));
        }
      } catch { /* optional */ }
    } catch (err) {
      console.error('Failed to load agent detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFile = useCallback(async (filename: string) => {
    setSelectedFile(filename);
    setFileContent(null);
    try {
      const res = await fetch(`/api/mabos/agents/${agentId}/files?filename=${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content || '');
      }
    } catch {
      setFileContent('Failed to load file');
    }
  }, [agentId]);

  const loadLazyFile = useCallback(async (filename: string): Promise<string> => {
    if (lazyContent[filename]) return lazyContent[filename];
    try {
      const res = await fetch(`/api/mabos/agents/${agentId}/files?filename=${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        const content = data.content || '';
        setLazyContent(prev => ({ ...prev, [filename]: content }));
        return content;
      }
    } catch { /* fall through */ }
    return '';
  }, [agentId, lazyContent]);

  const loadSkills = useCallback(async () => {
    if (parsedSkills) return;
    const content = await loadLazyFile('Skill.md');
    if (content) setParsedSkills(parseSkillTable(content));
    else setParsedSkills([]);
  }, [loadLazyFile, parsedSkills]);

  // Classified file lists
  const classified = useMemo(() => {
    const persona = files.filter(f => PERSONA_FILES.has(f.filename.toLowerCase()));
    const goals = files.filter(isGoalFile);
    const memory = files.filter(f => {
      const n = f.filename.toLowerCase();
      return ['memory.md', 'memory-journal.md', 'heartbeat.md'].includes(n) || (/^memory/i.test(n) && n !== 'memory.md');
    });
    const actionLog = files.filter(f => f.filename.toLowerCase() === 'actions.md');
    const reports = files.filter(isReportFile).sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const validationLogs = files.filter(f => /validation[_-]log/i.test(f.filename));
    const knowledge = files.filter(f => KNOWLEDGE_FILES.has(f.filename.toLowerCase()));
    const skills = files.filter(f => SKILL_FILES.has(f.filename.toLowerCase()));
    const tools = files.filter(f => TOOL_FILES.has(f.filename.toLowerCase()));
    const unclassified = files.filter(f => !isClassified(f));
    return { persona, goals, memory, actionLog, reports: [...reports, ...unclassified], validationLogs, knowledge, skills, tools };
  }, [files]);

  // ─── Tab definitions ───────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; shortLabel: string; icon: typeof Brain }[] = [
    { id: 'bdi', label: 'BDI', shortLabel: 'BDI', icon: Brain },
    { id: 'goals', label: 'Goals', shortLabel: 'Goals', icon: Target },
    { id: 'memory', label: 'Memory', shortLabel: 'Memory', icon: BookOpen },
    { id: 'knowledge', label: 'Knowledge', shortLabel: 'Know', icon: Lightbulb },
    { id: 'skills', label: 'Skills', shortLabel: 'Skills', icon: Zap },
    { id: 'tasks', label: 'Tasks', shortLabel: 'Tasks', icon: ListTodo },
    { id: 'activity', label: 'Activity', shortLabel: 'Activity', icon: Activity },
  ];

  // ─── Render helpers ────────────────────────────────────────────────────────

  const clearPreview = () => { setSelectedFile(null); setFileContent(null); };

  const panelClass = expanded
    ? 'fixed inset-[5%] z-50 flex flex-col shadow-2xl bg-mc-bg-secondary border border-mc-border rounded-xl'
    : 'fixed inset-y-0 right-0 w-full max-w-lg bg-mc-bg-secondary border-l border-mc-border z-50 flex flex-col shadow-2xl';

  // If showing a file preview, render it
  if (selectedFile && fileContent !== null) {
    return (
      <>
        {expanded && <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />}
        <div className={panelClass}>
          <div className="p-4 border-b border-mc-border flex items-center justify-between">
            <h3 className="font-semibold text-lg">{agentName}</h3>
            <div className="flex items-center gap-1">
              <button onClick={() => setExpanded(!expanded)} className="p-2 hover:bg-mc-bg-tertiary rounded">
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-2 hover:bg-mc-bg-tertiary rounded"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <FilePreview filename={selectedFile} content={fileContent} onBack={clearPreview} />
          </div>
        </div>
      </>
    );
  }

  // ─── Tab content renderers ─────────────────────────────────────────────────

  const renderBdiTab = () => (
    <div className="space-y-3">
      {/* Beliefs */}
      <CollapsibleSection title="Beliefs" badge={bdiDetail?.beliefCount}>
        <LazyFileContent filename="Beliefs.md" agentId={agentId} cache={lazyContent} setCache={setLazyContent} />
      </CollapsibleSection>

      {/* Desires */}
      <CollapsibleSection title="Desires" badge={bdiDetail?.desireCount}>
        {bdiDetail?.desires && bdiDetail.desires.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {bdiDetail.desires.map((d, i) => (
              <span key={i} className="text-xs bg-mc-bg-tertiary border border-mc-border px-2 py-1.5 rounded-md">{d}</span>
            ))}
          </div>
        )}
        <CollapsibleSection title="Detail (Desires.md)">
          <LazyFileContent filename="Desires.md" agentId={agentId} cache={lazyContent} setCache={setLazyContent} />
        </CollapsibleSection>
      </CollapsibleSection>

      {/* Intentions */}
      <CollapsibleSection title="Intentions" badge={bdiDetail?.intentionCount}>
        {bdiDetail?.intentions && bdiDetail.intentions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {bdiDetail.intentions.map((intent, i) => (
              <span key={i} className="text-xs bg-mc-bg-tertiary border border-mc-border px-2 py-1.5 rounded-md">{intent}</span>
            ))}
          </div>
        )}
        <CollapsibleSection title="Detail (Intentions.md)">
          <LazyFileContent filename="Intentions.md" agentId={agentId} cache={lazyContent} setCache={setLazyContent} />
        </CollapsibleSection>
      </CollapsibleSection>

      {/* Persona */}
      <CollapsibleSection title="Persona" defaultOpen>
        {big5Traits.length > 0 && (
          <div className="space-y-2 mb-4">
            <h5 className="text-xs font-medium text-mc-text-secondary uppercase tracking-wide">Big Five Personality</h5>
            {big5Traits.map(t => (
              <div key={t.trait} className="flex items-center gap-2">
                <span className="text-xs w-32 text-mc-text-secondary">{t.trait}</span>
                <div className="flex-1 h-2 bg-mc-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-mc-accent rounded-full transition-all"
                    style={{ width: `${Math.min(t.score * 100, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-mc-text-secondary w-8 text-right">{(t.score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {classified.persona.map(f => (
            <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );

  const renderGoalsTab = () => (
    <div className="space-y-3">
      <div className="px-1 mb-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-mc-text-secondary">Agent Goals</h4>
        <p className="text-[10px] text-mc-text-secondary mt-0.5">Role-specific goals for this agent (business goals are managed at the organization level)</p>
      </div>
      {classified.goals.length > 0 ? (
        <div className="space-y-2">
          {classified.goals.map(f => (
            <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
          ))}
        </div>
      ) : (
        <p className="text-mc-text-secondary text-sm">No goal files found.</p>
      )}
    </div>
  );

  const renderMemoryTab = () => (
    <div className="space-y-3">
      {/* Working Memory */}
      <CollapsibleSection title="Working Memory" badge={classified.memory.length} defaultOpen>
        <div className="space-y-2">
          {classified.memory.length > 0 ? classified.memory.map(f => (
            <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
          )) : <p className="text-xs text-mc-text-secondary">No working memory files.</p>}
        </div>
      </CollapsibleSection>

      {/* Action Log */}
      {classified.actionLog.length > 0 && (
        <CollapsibleSection title="Action Log" badge={classified.actionLog.length}>
          <div className="space-y-2">
            {classified.actionLog.map(f => (
              <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Reports & Incidents */}
      <CollapsibleSection title="Reports & Incidents" badge={classified.reports.length}>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {classified.reports.length > 0 ? classified.reports.map(f => (
            <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
          )) : <p className="text-xs text-mc-text-secondary">No reports found.</p>}
        </div>
      </CollapsibleSection>

      {/* Validation Logs */}
      {classified.validationLogs.length > 0 && (
        <CollapsibleSection title="Validation Logs" badge={classified.validationLogs.length}>
          <div className="space-y-2">
            {classified.validationLogs.map(f => (
              <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Communications */}
      <CollapsibleSection title="Communications">
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-mc-text-secondary mb-1">Inbox</h5>
            <pre className="bg-mc-bg p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border max-h-48">
              {messages.inbox || 'Empty'}
            </pre>
          </div>
          <div>
            <h5 className="text-xs font-medium text-mc-text-secondary mb-1">Outbox</h5>
            <pre className="bg-mc-bg p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap border border-mc-border max-h-48">
              {messages.outbox || 'Empty'}
            </pre>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );

  const renderKnowledgeTab = () => {
    const descriptions: Record<string, string> = {
      'knowledge.md': 'Domain expertise, decision frameworks',
      'capabilities.md': 'Available capabilities organized by category',
      'playbooks.md': 'Procedural rules, triggers, playbook steps',
    };
    return (
      <div className="space-y-2">
        {classified.knowledge.length > 0 ? classified.knowledge.map(f => (
          <button
            key={f.filename}
            onClick={() => loadFile(f.filename)}
            className="w-full flex items-center gap-3 p-4 bg-mc-bg rounded-lg border border-mc-border/50 hover:border-mc-accent/40 transition-colors text-left"
          >
            <Lightbulb className="w-5 h-5 text-mc-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{f.filename}</div>
              <div className="text-xs text-mc-text-secondary mt-0.5">
                {descriptions[f.filename.toLowerCase()] || ''} &middot; {formatSize(f.size)}
              </div>
            </div>
          </button>
        )) : (
          <p className="text-mc-text-secondary text-sm">No knowledge files found.</p>
        )}
      </div>
    );
  };

  const renderSkillsTab = () => {
    // Trigger load on first render
    if (parsedSkills === null) {
      loadSkills();
      return (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-4 h-4 animate-spin text-mc-text-secondary" />
          <span className="ml-2 text-sm text-mc-text-secondary">Loading skills...</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Skill Registry */}
        <div>
          <h4 className="text-xs font-medium text-mc-text-secondary uppercase tracking-wide mb-2">
            Skill Registry ({parsedSkills.length})
          </h4>
          {parsedSkills.length > 0 ? (
            <div className={`grid ${expanded ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
              {parsedSkills.map(skill => (
                <div
                  key={skill.id}
                  className="p-2.5 bg-mc-bg rounded-lg border border-mc-border/50 hover:border-mc-border transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-mc-text-secondary font-mono">{skill.id}</span>
                    <span className={`w-2 h-2 rounded-full ${skill.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </div>
                  <div className="text-xs font-mono font-medium truncate">{skill.name}</div>
                  <div className="text-[11px] text-mc-text-secondary mt-0.5 line-clamp-2">{skill.description}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mc-text-secondary">No skills parsed from Skill.md</p>
          )}
        </div>

        {/* Configuration */}
        {classified.tools.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-mc-text-secondary uppercase tracking-wide mb-2">Configuration</h4>
            <div className="space-y-2">
              {classified.tools.map(f => (
                <FileCard key={f.filename} file={f} onClick={() => loadFile(f.filename)} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      {expanded && <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />}
      <div className={panelClass}>
        {/* Header */}
        <div className={`p-4 border-b border-mc-border flex items-center justify-between ${expanded ? 'rounded-t-xl' : ''}`}>
          <div>
            <h3 className="font-semibold text-lg">{agentName}</h3>
            {bdiDetail && (
              <div className="flex items-center gap-3 text-xs text-mc-text-secondary mt-1">
                <span>B:{bdiDetail.beliefCount}</span>
                <span>G:{bdiDetail.goalCount}</span>
                <span>I:{bdiDetail.intentionCount}</span>
                <span>D:{bdiDetail.desireCount}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded(!expanded)} className="p-2 hover:bg-mc-bg-tertiary rounded">
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-mc-bg-tertiary rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-mc-border overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 ${expanded ? 'px-4 py-3 text-sm' : 'px-2.5 py-2.5 text-[11px]'} border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t.id
                  ? 'border-mc-accent text-mc-accent'
                  : 'border-transparent text-mc-text-secondary hover:text-mc-text'
              }`}
            >
              <t.icon className={expanded ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
              {expanded ? t.label : t.shortLabel}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 animate-spin text-mc-text-secondary" />
            </div>
          ) : tab === 'bdi' ? renderBdiTab()
            : tab === 'goals' ? renderGoalsTab()
            : tab === 'memory' ? renderMemoryTab()
            : tab === 'knowledge' ? renderKnowledgeTab()
            : tab === 'skills' ? renderSkillsTab()
            : tab === 'activity' ? <CognitiveActivityFeed agentId={agentId} compact />
            : <p className="text-mc-text-secondary text-sm">Task assignments for this agent will appear here after sync.</p>
          }
        </div>
      </div>
    </>
  );
}

// ─── Lazy File Content Loader ────────────────────────────────────────────────

function LazyFileContent({
  filename, agentId, cache, setCache,
}: {
  filename: string;
  agentId: string;
  cache: Record<string, string>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [loading, setLoading] = useState(false);
  const content = cache[filename];

  useEffect(() => {
    if (content !== undefined) return;
    setLoading(true);
    fetch(`/api/mabos/agents/${agentId}/files?filename=${encodeURIComponent(filename)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.content) setCache(prev => ({ ...prev, [filename]: data.content }));
        else setCache(prev => ({ ...prev, [filename]: '(File not found)' }));
      })
      .catch(() => setCache(prev => ({ ...prev, [filename]: '(Failed to load)' })))
      .finally(() => setLoading(false));
  }, [filename, agentId, content, setCache]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <RefreshCw className="w-3 h-3 animate-spin text-mc-text-secondary" />
        <span className="text-xs text-mc-text-secondary">Loading {filename}...</span>
      </div>
    );
  }

  return <SmartFileRenderer filename={filename} content={content || '(Empty)'} />;
}
