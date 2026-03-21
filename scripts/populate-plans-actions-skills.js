#!/usr/bin/env node
/**
 * Populate agent_plans, plan_steps, agent_skills, agent_activities,
 * agent_beliefs, agent_desires, agent_intentions, agent_capabilities,
 * agent_memories, and agent_personas from MABOS workspace Markdown files on VPS.
 *
 * Usage: node scripts/populate-plans-actions-skills.js [--db path/to/db]
 */

const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const dbPath = process.argv.includes('--db')
  ? process.argv[process.argv.indexOf('--db') + 1]
  : path.join(process.cwd(), 'mission-control.db');

const VPS = 'kingler@100.79.202.93';
const WORKSPACE = '~/.openclaw/workspace/agents';

// Map workspace dir names → DB agent IDs
const AGENT_MAP = {
  'ceo': 'mabos-ceo',
  'cfo': 'mabos-cfo',
  'cmo': 'mabos-cmo',
  'coo': 'mabos-coo',
  'cto': 'mabos-cto',
  'legal': 'mabos-legal',
  'hr': 'mabos-hr',
  'knowledge': 'mabos-knowledge',
  'strategy': 'mabos-strategy',
  'compliance-director': 'mabos-compliance-director',
  'creative-director': 'mabos-creative-director',
  'cs-director': 'mabos-cs-director',
  'sales-director': 'mabos-sales-director',
  'marketing-director': 'mabos-marketing-director',
  'fulfillment-mgr': 'mabos-fulfillment-mgr',
  'inventory-mgr': 'mabos-inventory-mgr',
  'product-mgr': 'mabos-product-mgr',
};

console.log(`[Populate] Database: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const uuid = () => crypto.randomUUID().slice(0, 8);

// ── SSH helper ──────────────────────────────────────────────────────
function sshRead(filePath) {
  try {
    return execSync(`ssh ${VPS} "cat ${filePath}"`, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

// ── 2a: Parse Plans.md ──────────────────────────────────────────────
function parsePlans(md, agentId) {
  const plans = [];
  // Split on ### P- headers
  const planBlocks = md.split(/^### /m).slice(1);

  for (const block of planBlocks) {
    const lines = block.split('\n');
    const headerLine = lines[0];

    // Extract plan ID and title from "P-xxx: Title" or "PLAN_NAME: Title"
    const headerMatch = headerLine.match(/^([\w-]+):\s*(.+)/);
    if (!headerMatch) continue;

    const planId = headerMatch[1];
    const title = headerMatch[2].trim();

    // Extract metadata fields
    const goalMatch = block.match(/\*\*Goal:\*\*\s*(\S+)/);
    const sourceMatch = block.match(/\*\*Source:\*\*\s*(.+)/);
    const statusMatch = block.match(/\*\*Status:\*\*\s*(\w+)/);
    const confidenceMatch = block.match(/\*\*Confidence:\*\*\s*([\d.]+)/);
    const strategyMatch = block.match(/\*\*Strategy:\*\*\s*(.+)/);

    const plan = {
      id: `${agentId}--${planId}`,
      agent_id: agentId,
      goal_id: goalMatch ? goalMatch[1] : null,
      title,
      source: sourceMatch ? sourceMatch[1].trim() : 'htn-generated',
      status: statusMatch ? statusMatch[1] : 'active',
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : null,
      strategy: strategyMatch ? strategyMatch[1].trim() : null,
      steps: [],
    };

    // Extract steps from HTN table
    const stepTableMatch = block.match(/\| Step \|.*\n\|[-|]+\|\n([\s\S]*?)(?=\n####|\n###|\n## |$)/);
    if (stepTableMatch) {
      const stepLines = stepTableMatch[1].trim().split('\n').filter(l => l.startsWith('|'));
      let stepNum = 0;
      for (const line of stepLines) {
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 6) {
          stepNum++;
          plan.steps.push({
            id: `${plan.id}--${cols[0]}`,
            step_number: stepNum,
            description: cols[1],
            step_type: cols[2] || 'primitive',
            assigned_to: cols[3] === '—' || cols[3] === 'self' ? agentId : cols[3],
            depends_on: cols[4] === '—' ? null : cols[4],
            status: cols[5] || 'pending',
            estimated_duration: cols[6] === '—' ? null : (cols[6] || null),
          });
        }
      }
    }

    plans.push(plan);
  }

  return plans;
}

// ── 2b: Parse Actions.md ────────────────────────────────────────────
function parseActions(md, agentId) {
  const actions = [];

  // Format 1: Tabular — | Timestamp | Tool | Task | Outcome | Summary |
  const tableMatch = md.match(/\| Timestamp \|.*\n\|[-|]+\|\n([\s\S]*?)(?=\n## |$)/);
  if (tableMatch) {
    const rows = tableMatch[1].trim().split('\n').filter(l => l.startsWith('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 5) {
        actions.push({
          id: `act-${uuid()}`,
          agent_id: agentId,
          category: 'action',
          tool_name: cols[1],
          summary: cols[4],
          outcome: cols[3] || 'ok',
          created_at: cols[0],
        });
      }
    }
  }

  // Format 2: Standalone table rows anywhere in the file
  const allTableRows = md.match(/^\| \d{4}-\d{2}-\d{2}T.+\|$/gm);
  if (allTableRows) {
    for (const row of allTableRows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 5) {
        actions.push({
          id: `act-${uuid()}`,
          agent_id: agentId,
          category: 'action',
          tool_name: cols[1],
          summary: cols[4],
          outcome: cols[3] || 'ok',
          created_at: cols[0],
        });
      }
    }
  }

  // Format 3: Narrative — ### [HH:MM UTC] Title with **Tool Used:** and **Outcome:**
  const narrativeBlocks = md.match(/^### \[[\d:]+ UTC\].+(?:\n(?!###).+)*/gm);
  if (narrativeBlocks) {
    for (const block of narrativeBlocks) {
      const titleMatch = block.match(/^### \[([\d:]+ UTC)\] (.+)/);
      const toolMatch = block.match(/\*\*Tool Used:\*\*\s*(.+)/);
      const outcomeMatch = block.match(/\*\*Outcome:\*\*\s*(.+)/);
      const summaryMatch = block.match(/\*\*Summary:\*\*\s*([\s\S]*?)(?=\n- \*\*|$)/);
      const dateMatch = block.match(/## (\d{4}-\d{2}-\d{2})/) || md.match(new RegExp(`## (\\d{4}-\\d{2}-\\d{2})[\\s\\S]*?${titleMatch ? titleMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30) : 'NOMATCH'}`));

      if (titleMatch) {
        const dateSectionMatch = md.slice(0, md.indexOf(block)).match(/## (\d{4}-\d{2}-\d{2})\s*$/m);
        const dateStr = dateSectionMatch ? `${dateSectionMatch[1]}T${titleMatch[1].replace(' UTC', '')}:00.000Z` : new Date().toISOString();

        actions.push({
          id: `act-${uuid()}`,
          agent_id: agentId,
          category: 'action',
          tool_name: toolMatch ? toolMatch[1].split('(')[0].trim() : 'unknown',
          summary: summaryMatch ? summaryMatch[1].trim().split('\n')[0] : titleMatch[2],
          outcome: outcomeMatch ? outcomeMatch[1].trim() : 'ok',
          created_at: dateStr,
        });
      }
    }
  }

  return actions;
}

// ── 2c: Parse Skill.md ─────────────────────────────────────────────
function parseSkills(md, agentId) {
  const skills = [];

  // Handle table format: | ID | Skill | Tools | Status |
  const tableMatch = md.match(/\| ID \|.*\n\|[-|]+\|\n([\s\S]*?)(?=\n## |$)/);
  if (tableMatch) {
    const rows = tableMatch[1].trim().split('\n').filter(l => l.startsWith('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2) {
        const skillId = cols[0]; // e.g. SK-001
        let skillName = cols[1];
        let description = '';

        // Parse "`tool_name` — Description" format
        const toolMatch = skillName.match(/^`(\w+)`\s*—\s*(.+)/);
        if (toolMatch) {
          skillName = toolMatch[1];
          description = toolMatch[2];
        }

        // Categorize by tool prefix
        let category = 'general';
        if (skillName.match(/^(belief|goal|desire|intention|bdi)/)) category = 'bdi';
        else if (skillName.match(/^(plan|htn|cbr)/)) category = 'planning';
        else if (skillName.match(/^(fact|infer|knowledge|ontology|rule|constraint|policy)/)) category = 'knowledge';
        else if (skillName.match(/^(reason)/)) category = 'reasoning';
        else if (skillName.match(/^(agent_message|decision|contract_net|inbox)/)) category = 'communication';
        else if (skillName.match(/^(memory)/)) category = 'memory';
        else if (skillName.match(/^(business|metrics)/)) category = 'business';
        else if (skillName.match(/^(skill|action)/)) category = 'workflow';

        const status = cols.length >= 4 ? cols[3] : 'active';

        skills.push({
          id: `${agentId}--${skillId}`,
          agent_id: agentId,
          skill_name: skillName,
          description,
          category,
          status,
        });
      }
    }
  }

  return skills;
}

// ── 2d: Parse Beliefs.md ────────────────────────────────────────────
function parseBeliefs(md, agentId) {
  const beliefs = [];

  // Determine category from section headers
  const sections = md.split(/^## /m).slice(1);
  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    let category = 'observation';
    if (/environment/i.test(headerLine)) category = 'environment';
    else if (/self/i.test(headerLine)) category = 'self';
    else if (/agent/i.test(headerLine)) category = 'agent';
    else if (/business/i.test(headerLine)) category = 'business';
    else if (/current/i.test(headerLine)) continue; // skip "Current Beliefs" wrapper

    // Parse table rows: | ID | Belief | Value | Certainty | Source | Updated |
    const tableRows = section.match(/^\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|$/gm);
    if (tableRows) {
      for (const row of tableRows) {
        const cols = row.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 5 && cols[0].match(/^B-/)) {
          beliefs.push({
            id: `${agentId}--${cols[0]}`,
            agent_id: agentId,
            category,
            belief: cols[1].replace(/\*\*/g, ''),
            value: cols[2] || null,
            certainty: parseFloat(cols[3]) || 0.5,
            source: cols[4] || null,
            updated_at: cols[5] || null,
          });
        }
      }
    }

    // Parse free-form bullets as observations
    const bullets = section.match(/^- .+$/gm);
    if (bullets) {
      for (const bullet of bullets) {
        const text = bullet.replace(/^- /, '').trim();
        if (!text || text.startsWith('|')) continue;
        beliefs.push({
          id: `${agentId}--obs-${uuid()}`,
          agent_id: agentId,
          category: 'observation',
          belief: text.slice(0, 500),
          value: null,
          certainty: 0.5,
          source: 'observation',
          updated_at: null,
        });
      }
    }
  }

  // Also capture top-level change-log rows (e.g. | 2026-03-20 | B-BIZ-... | created | ... |)
  const changeLogRows = md.match(/^\| \d{4}-\d{2}-\d{2} \| B-[\w-]+ \|.+\|$/gm);
  if (changeLogRows) {
    for (const row of changeLogRows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 4) {
        beliefs.push({
          id: `${agentId}--${cols[1]}`,
          agent_id: agentId,
          category: 'business',
          belief: cols[3] || cols[1],
          value: null,
          certainty: 0.5,
          source: cols[5] || 'change-log',
          updated_at: cols[0] || null,
        });
      }
    }
  }

  return beliefs;
}

// ── 2e: Parse Desires.md ────────────────────────────────────────────
function parseDesires(md, agentId) {
  const desires = [];

  const sections = md.split(/^## /m).slice(1);
  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    let desireType = 'terminal';
    if (/instrumental/i.test(headerLine)) desireType = 'instrumental';
    else if (/learning/i.test(headerLine)) desireType = 'learning';
    else if (/terminal/i.test(headerLine)) desireType = 'terminal';
    else continue; // skip non-desire sections

    const tableRows = section.match(/^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|$/gm);
    if (!tableRows) continue;

    for (const row of tableRows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 4 || !cols[0].match(/^D-/)) continue;

      const desire = {
        id: `${agentId}--${cols[0]}`,
        agent_id: agentId,
        desire_type: desireType,
        desire: cols[1].replace(/\*\*/g, ''),
        priority: 0.5,
        importance: null,
        serves: null,
        status: 'active',
      };

      if (desireType === 'terminal') {
        // | ID | Desire | Priority | Importance | Status |
        desire.priority = parseFloat(cols[2]) || 0.5;
        desire.importance = cols[3] || null;
        desire.status = cols[4] || 'Active';
      } else if (desireType === 'instrumental') {
        // | ID | Desire | Serves | Priority | Status |
        desire.serves = cols[2] || null;
        desire.priority = parseFloat(cols[3]) || 0.5;
        desire.status = cols[4] || 'Active';
      } else if (desireType === 'learning') {
        // | ID | Desire | Skill Area | Priority | Status |
        desire.importance = cols[2] || null; // store skill area in importance
        desire.priority = parseFloat(cols[3]) || 0.5;
        desire.status = cols[4] || 'Active';
      }

      desires.push(desire);
    }
  }

  return desires;
}

// ── 2f: Parse Intentions.md ─────────────────────────────────────────
function parseIntentions(md, agentId) {
  const intentions = [];

  // Format 1: Structured blocks — ### I-xxx: Goal via Plan
  const structuredBlocks = md.match(/^### (I-[\w-]+): (.+)$/gm);
  if (structuredBlocks) {
    for (const header of structuredBlocks) {
      const match = header.match(/^### (I-[\w-]+): (.+?) via (.+)$/);
      if (!match) continue;
      const [, iId, goalRef, planRef] = match;

      // Find the block content after this header
      const blockStart = md.indexOf(header);
      const nextHeader = md.indexOf('\n### ', blockStart + 1);
      const nextSection = md.indexOf('\n## ', blockStart + 1);
      const blockEnd = Math.min(
        nextHeader > -1 ? nextHeader : md.length,
        nextSection > -1 ? nextSection : md.length
      );
      const block = md.slice(blockStart, blockEnd);

      const strategyMatch = block.match(/\*\*Strategy:\*\*\s*(.+)/);
      const statusMatch = block.match(/\*\*Status:\*\*\s*(\w+)/);
      const stepMatch = block.match(/\*\*Current Step:\*\*\s*(\S+)/);
      const progressMatch = block.match(/\*\*Progress:\*\*\s*([\d.]+)/);
      const startedMatch = block.match(/\*\*Started:\*\*\s*(\S+)/);

      intentions.push({
        id: `${agentId}--${iId}`,
        agent_id: agentId,
        goal_ref: goalRef.trim(),
        plan_ref: planRef.trim(),
        strategy: strategyMatch ? strategyMatch[1].trim() : 'open-minded',
        status: statusMatch ? statusMatch[1] : 'active',
        current_step: stepMatch ? stepMatch[1] : null,
        progress: progressMatch ? parseFloat(progressMatch[1]) / 100 : 0,
        started_at: startedMatch ? startedMatch[1] : null,
      });
    }
  }

  // Format 2: Table rows — | ID | Goal | Plan | Status | Commitment | Started |
  const sections = md.split(/^## /m).slice(1);
  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    // Process Active Intentions and Planned Intentions tables
    const isPlanned = /planned/i.test(headerLine);
    const isCompleted = /completed/i.test(headerLine);
    const isExpired = /expired/i.test(headerLine);
    if (isCompleted || isExpired) continue;

    const tableRows = section.match(/^\| INT-[\w-]+ \|.+\|$/gm);
    if (!tableRows) continue;

    for (const row of tableRows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 4 || !cols[0].match(/^INT-/)) continue;

      if (isPlanned) {
        // | ID | Goal | Trigger | Priority | Dependencies |
        intentions.push({
          id: `${agentId}--${cols[0]}`,
          agent_id: agentId,
          goal_ref: cols[1] || null,
          plan_ref: cols[2] || null, // trigger stored as plan_ref
          strategy: 'open-minded',
          status: 'planned',
          current_step: null,
          progress: 0,
          started_at: null,
        });
      } else {
        // | ID | Goal | Plan | Status | Commitment | Started |
        intentions.push({
          id: `${agentId}--${cols[0]}`,
          agent_id: agentId,
          goal_ref: cols[1] || null,
          plan_ref: cols[2] || null,
          strategy: (cols[4] || 'open-minded').toLowerCase().replace(/\s+/g, '-'),
          status: (cols[3] || 'active').toLowerCase().replace(/\s+/g, '_'),
          current_step: null,
          progress: 0,
          started_at: cols[5] || null,
        });
      }
    }
  }

  return intentions;
}

// ── 2g: Parse Capabilities.md ───────────────────────────────────────
function parseCapabilities(md, agentId) {
  const capabilities = [];

  // Bullet list: - `tool_name` — description
  const bullets = md.match(/^- `(\w+)` — (.+)$/gm);
  if (bullets) {
    for (const bullet of bullets) {
      const match = bullet.match(/^- `(\w+)` — (.+)$/);
      if (!match) continue;
      capabilities.push({
        id: `${agentId}--cap-${match[1]}`,
        agent_id: agentId,
        tool_name: match[1],
        description: match[2].trim(),
      });
    }
  }

  return capabilities;
}

// ── 2h: Parse Memory.md ────────────────────────────────────────────
function parseMemories(md, agentId) {
  const memories = [];

  const sections = md.split(/^## /m).slice(1);
  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    let category = 'event';
    if (/stakeholder|decision/i.test(headerLine)) category = 'decision';
    else if (/stress|test|system/i.test(headerLine)) category = 'event';
    else if (/goal|milestone/i.test(headerLine)) category = 'milestone';
    else if (/recommend/i.test(headerLine)) category = 'recommendation';

    // Entries: - [2026-03-15] Content  OR  - [2026-03-15] LLM recommended ...
    const entries = section.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.+)$/gm);
    if (!entries) continue;

    for (const entry of entries) {
      const match = entry.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.+)$/);
      if (!match) continue;
      memories.push({
        id: `mem-${uuid()}`,
        agent_id: agentId,
        category,
        content: match[2].trim().slice(0, 1000),
        logged_at: match[1],
      });
    }
  }

  return memories;
}

// ── 2i: Parse Persona.md ───────────────────────────────────────────
function parsePersona(md, agentId) {
  const persona = {
    id: `${agentId}--persona`,
    agent_id: agentId,
    role_title: '',
    reports_to: null,
    direct_reports: null,
    identity: null,
    behavioral_guidelines: null,
    decision_authority: null,
    commitment_strategy: null,
  };

  // Role from first heading or **Role:** field
  const roleMatch = md.match(/\*\*Role:\*\*\s*(.+)/) || md.match(/^# Persona — (.+)/m);
  if (roleMatch) persona.role_title = roleMatch[1].trim();

  const reportsMatch = md.match(/\*\*Reports To:\*\*\s*(.+)/);
  if (reportsMatch) persona.reports_to = reportsMatch[1].trim();

  const directReportsMatch = md.match(/\*\*Direct Reports:\*\*\s*(.+)/);
  if (directReportsMatch) persona.direct_reports = directReportsMatch[1].trim();

  // Identity section
  const identityMatch = md.match(/## Identity\n([\s\S]*?)(?=\n## |$)/);
  if (identityMatch) persona.identity = identityMatch[1].trim().slice(0, 2000);

  // Behavioral Guidelines section
  const guidelinesMatch = md.match(/## Behavioral Guidelines\n([\s\S]*?)(?=\n## |$)/);
  if (guidelinesMatch) persona.behavioral_guidelines = guidelinesMatch[1].trim().slice(0, 2000);

  // Decision Authority section
  const authorityMatch = md.match(/## Decision Authority\n([\s\S]*?)(?=\n## |$)/);
  if (authorityMatch) persona.decision_authority = authorityMatch[1].trim().slice(0, 2000);

  // Commitment Strategy from BDI Configuration
  const commitMatch = md.match(/\*\*Commitment Strategy:\*\*\s*(.+)/);
  if (commitMatch) persona.commitment_strategy = commitMatch[1].trim();

  if (!persona.role_title) return null;
  return persona;
}

// ── Insert helpers ──────────────────────────────────────────────────
const insertPlan = db.prepare(`
  INSERT OR IGNORE INTO agent_plans (id, agent_id, goal_id, title, source, status, confidence, strategy, business_id)
  VALUES (@id, @agent_id, @goal_id, @title, @source, @status, @confidence, @strategy, 'vividwalls')
`);

const insertStep = db.prepare(`
  INSERT OR IGNORE INTO plan_steps (id, plan_id, step_number, description, step_type, assigned_to, depends_on, status, estimated_duration)
  VALUES (@id, @plan_id, @step_number, @description, @step_type, @assigned_to, @depends_on, @status, @estimated_duration)
`);

const insertActivity = db.prepare(`
  INSERT OR IGNORE INTO agent_activities (id, agent_id, category, tool_name, summary, outcome, created_at)
  VALUES (@id, @agent_id, @category, @tool_name, @summary, @outcome, @created_at)
`);

const insertSkill = db.prepare(`
  INSERT OR IGNORE INTO agent_skills (id, agent_id, skill_name, description, category, status, business_id)
  VALUES (@id, @agent_id, @skill_name, @description, @category, @status, 'vividwalls')
`);

const insertBelief = db.prepare(`
  INSERT OR IGNORE INTO agent_beliefs (id, agent_id, category, belief, value, certainty, source, business_id, updated_at)
  VALUES (@id, @agent_id, @category, @belief, @value, @certainty, @source, 'vividwalls', @updated_at)
`);

const insertDesire = db.prepare(`
  INSERT OR IGNORE INTO agent_desires (id, agent_id, desire_type, desire, priority, importance, serves, status, business_id)
  VALUES (@id, @agent_id, @desire_type, @desire, @priority, @importance, @serves, @status, 'vividwalls')
`);

const insertIntention = db.prepare(`
  INSERT OR IGNORE INTO agent_intentions (id, agent_id, goal_ref, plan_ref, strategy, status, current_step, progress, started_at, business_id)
  VALUES (@id, @agent_id, @goal_ref, @plan_ref, @strategy, @status, @current_step, @progress, @started_at, 'vividwalls')
`);

const insertCapability = db.prepare(`
  INSERT OR IGNORE INTO agent_capabilities (id, agent_id, tool_name, description, business_id)
  VALUES (@id, @agent_id, @tool_name, @description, 'vividwalls')
`);

const insertMemory = db.prepare(`
  INSERT OR IGNORE INTO agent_memories (id, agent_id, category, content, logged_at, business_id)
  VALUES (@id, @agent_id, @category, @content, @logged_at, 'vividwalls')
`);

const insertPersona = db.prepare(`
  INSERT OR REPLACE INTO agent_personas (id, agent_id, role_title, reports_to, direct_reports, identity, behavioral_guidelines, decision_authority, commitment_strategy, business_id)
  VALUES (@id, @agent_id, @role_title, @reports_to, @direct_reports, @identity, @behavioral_guidelines, @decision_authority, @commitment_strategy, 'vividwalls')
`);

// ── Main ────────────────────────────────────────────────────────────

// Clean existing data for re-population
console.log('[Populate] Cleaning existing data...');
db.exec('DELETE FROM plan_steps');
db.exec('DELETE FROM agent_plans');
db.exec('DELETE FROM agent_skills');
db.exec('DELETE FROM agent_activities');
db.exec('DELETE FROM agent_beliefs');
db.exec('DELETE FROM agent_desires');
db.exec('DELETE FROM agent_intentions');
db.exec('DELETE FROM agent_capabilities');
db.exec('DELETE FROM agent_memories');
db.exec('DELETE FROM agent_personas');
console.log('[Populate] Cleaned.');

let totalPlans = 0, totalSteps = 0, totalActions = 0, totalSkills = 0;
let totalBeliefs = 0, totalDesires = 0, totalIntentions = 0;
let totalCapabilities = 0, totalMemories = 0, totalPersonas = 0;

// Check which agents have files on VPS
console.log('[Populate] Checking VPS for agent workspace files...');
const agentFileMap = {};
for (const dirName of Object.keys(AGENT_MAP)) {
  let flags = '';
  try {
    const check = execSync(
      `ssh ${VPS} "ls ${WORKSPACE}/${dirName}/Plans.md ${WORKSPACE}/${dirName}/Actions.md ${WORKSPACE}/${dirName}/Skill.md ${WORKSPACE}/${dirName}/Beliefs.md ${WORKSPACE}/${dirName}/Desires.md ${WORKSPACE}/${dirName}/Intentions.md ${WORKSPACE}/${dirName}/Capabilities.md ${WORKSPACE}/${dirName}/Memory.md ${WORKSPACE}/${dirName}/Persona.md 2>/dev/null; true"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    if (check.includes('Plans.md')) flags += 'P';
    if (check.includes('Actions.md')) flags += 'A';
    if (check.includes('Skill.md')) flags += 'S';
    if (check.includes('Beliefs.md')) flags += 'B';
    if (check.includes('Desires.md')) flags += 'D';
    if (check.includes('Intentions.md')) flags += 'I';
    if (check.includes('Capabilities.md')) flags += 'C';
    if (check.includes('Memory.md')) flags += 'M';
    if (check.includes('Persona.md')) flags += 'R';
  } catch { /* agent dir may not have these files */ }
  agentFileMap[dirName] = flags;
}

const insertAll = db.transaction(() => {
  for (const [dirName, agentId] of Object.entries(AGENT_MAP)) {
    const flags = agentFileMap[dirName] || '';
    console.log(`\n[${agentId}] flags=${flags}`);

    // Plans
    if (flags.includes('P')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Plans.md`);
      if (md) {
        const plans = parsePlans(md, agentId);
        for (const plan of plans) {
          insertPlan.run(plan);
          totalPlans++;
          for (const step of plan.steps) {
            insertStep.run({ ...step, plan_id: plan.id });
            totalSteps++;
          }
        }
        console.log(`  Plans: ${plans.length}, Steps: ${plans.reduce((s, p) => s + p.steps.length, 0)}`);
      }
    }

    // Actions
    if (flags.includes('A')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Actions.md`);
      if (md) {
        const actions = parseActions(md, agentId);
        for (const action of actions) {
          insertActivity.run(action);
          totalActions++;
        }
        console.log(`  Actions: ${actions.length}`);
      }
    }

    // Skills
    if (flags.includes('S')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Skill.md`);
      if (md) {
        const skills = parseSkills(md, agentId);
        for (const skill of skills) {
          insertSkill.run(skill);
          totalSkills++;
        }
        console.log(`  Skills: ${skills.length}`);
      }
    }

    // Beliefs
    if (flags.includes('B')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Beliefs.md`);
      if (md) {
        const beliefs = parseBeliefs(md, agentId);
        for (const b of beliefs) {
          insertBelief.run(b);
          totalBeliefs++;
        }
        console.log(`  Beliefs: ${beliefs.length}`);
      }
    }

    // Desires
    if (flags.includes('D')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Desires.md`);
      if (md) {
        const desires = parseDesires(md, agentId);
        for (const d of desires) {
          insertDesire.run(d);
          totalDesires++;
        }
        console.log(`  Desires: ${desires.length}`);
      }
    }

    // Intentions
    if (flags.includes('I')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Intentions.md`);
      if (md) {
        const intentions = parseIntentions(md, agentId);
        for (const i of intentions) {
          insertIntention.run(i);
          totalIntentions++;
        }
        console.log(`  Intentions: ${intentions.length}`);
      }
    }

    // Capabilities
    if (flags.includes('C')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Capabilities.md`);
      if (md) {
        const caps = parseCapabilities(md, agentId);
        for (const c of caps) {
          insertCapability.run(c);
          totalCapabilities++;
        }
        console.log(`  Capabilities: ${caps.length}`);
      }
    }

    // Memory
    if (flags.includes('M')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Memory.md`);
      if (md) {
        const mems = parseMemories(md, agentId);
        for (const m of mems) {
          insertMemory.run(m);
          totalMemories++;
        }
        console.log(`  Memories: ${mems.length}`);
      }
    }

    // Persona
    if (flags.includes('R')) {
      const md = sshRead(`${WORKSPACE}/${dirName}/Persona.md`);
      if (md) {
        const persona = parsePersona(md, agentId);
        if (persona) {
          insertPersona.run(persona);
          totalPersonas++;
          console.log(`  Persona: ${persona.role_title}`);
        }
      }
    }
  }
});

insertAll();

// Update cached BDI counts on agents table
console.log('\n[Populate] Updating BDI counts on agents table...');
db.exec(`UPDATE agents SET belief_count = (SELECT COUNT(*) FROM agent_beliefs WHERE agent_beliefs.agent_id = agents.id)`);
db.exec(`UPDATE agents SET desire_count = (SELECT COUNT(*) FROM agent_desires WHERE agent_desires.agent_id = agents.id)`);
db.exec(`UPDATE agents SET intention_count = (SELECT COUNT(*) FROM agent_intentions WHERE agent_intentions.agent_id = agents.id)`);

console.log('\n[Populate] Done!');
console.log(`  Plans:         ${totalPlans}`);
console.log(`  Steps:         ${totalSteps}`);
console.log(`  Actions:       ${totalActions}`);
console.log(`  Skills:        ${totalSkills}`);
console.log(`  Beliefs:       ${totalBeliefs}`);
console.log(`  Desires:       ${totalDesires}`);
console.log(`  Intentions:    ${totalIntentions}`);
console.log(`  Capabilities:  ${totalCapabilities}`);
console.log(`  Memories:      ${totalMemories}`);
console.log(`  Personas:      ${totalPersonas}`);

// Verify counts from DB
const planCount = db.prepare('SELECT COUNT(*) as c FROM agent_plans').get().c;
const stepCount = db.prepare('SELECT COUNT(*) as c FROM plan_steps').get().c;
const activityCount = db.prepare('SELECT COUNT(*) as c FROM agent_activities').get().c;
const skillCount = db.prepare('SELECT COUNT(*) as c FROM agent_skills').get().c;
const beliefCount = db.prepare('SELECT COUNT(*) as c FROM agent_beliefs').get().c;
const desireCount = db.prepare('SELECT COUNT(*) as c FROM agent_desires').get().c;
const intentionCount = db.prepare('SELECT COUNT(*) as c FROM agent_intentions').get().c;
const capabilityCount = db.prepare('SELECT COUNT(*) as c FROM agent_capabilities').get().c;
const memoryCount = db.prepare('SELECT COUNT(*) as c FROM agent_memories').get().c;
const personaCount = db.prepare('SELECT COUNT(*) as c FROM agent_personas').get().c;

console.log('\n[DB Counts]');
console.log(`  agent_plans:        ${planCount}`);
console.log(`  plan_steps:         ${stepCount}`);
console.log(`  agent_activities:   ${activityCount}`);
console.log(`  agent_skills:       ${skillCount}`);
console.log(`  agent_beliefs:      ${beliefCount}`);
console.log(`  agent_desires:      ${desireCount}`);
console.log(`  agent_intentions:   ${intentionCount}`);
console.log(`  agent_capabilities: ${capabilityCount}`);
console.log(`  agent_memories:     ${memoryCount}`);
console.log(`  agent_personas:     ${personaCount}`);

db.close();
