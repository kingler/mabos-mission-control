#!/usr/bin/env node
/**
 * Populate agent_plans, plan_steps, agent_skills, and agent_activities
 * from MABOS workspace Markdown files on VPS.
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

// ── Main ────────────────────────────────────────────────────────────

// Clean existing data for re-population
console.log('[Populate] Cleaning existing data...');
db.exec('DELETE FROM plan_steps');
db.exec('DELETE FROM agent_plans');
db.exec('DELETE FROM agent_skills');
db.exec('DELETE FROM agent_activities');
console.log('[Populate] Cleaned.');

let totalPlans = 0, totalSteps = 0, totalActions = 0, totalSkills = 0;

// Check which agents have files on VPS
console.log('[Populate] Checking VPS for agent workspace files...');
const agentFileMap = {};
for (const dirName of Object.keys(AGENT_MAP)) {
  let flags = '';
  try {
    const check = execSync(
      `ssh ${VPS} "ls ${WORKSPACE}/${dirName}/Plans.md ${WORKSPACE}/${dirName}/Actions.md ${WORKSPACE}/${dirName}/Skill.md 2>/dev/null"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    if (check.includes('Plans.md')) flags += 'P';
    if (check.includes('Actions.md')) flags += 'A';
    if (check.includes('Skill.md')) flags += 'S';
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
  }
});

insertAll();

console.log('\n[Populate] Done!');
console.log(`  Plans:      ${totalPlans}`);
console.log(`  Steps:      ${totalSteps}`);
console.log(`  Actions:    ${totalActions}`);
console.log(`  Skills:     ${totalSkills}`);

// Verify counts from DB
const planCount = db.prepare('SELECT COUNT(*) as c FROM agent_plans').get().c;
const stepCount = db.prepare('SELECT COUNT(*) as c FROM plan_steps').get().c;
const activityCount = db.prepare('SELECT COUNT(*) as c FROM agent_activities').get().c;
const skillCount = db.prepare('SELECT COUNT(*) as c FROM agent_skills').get().c;

console.log('\n[DB Counts]');
console.log(`  agent_plans:      ${planCount}`);
console.log(`  plan_steps:       ${stepCount}`);
console.log(`  agent_activities: ${activityCount}`);
console.log(`  agent_skills:     ${skillCount}`);

db.close();
