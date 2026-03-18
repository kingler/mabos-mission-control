'use client';

import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  agentId: string;
  action: string;
  enabled: boolean | number;
  status: string;
  lastRun?: string;
  nextRun?: string;
  last_run?: string;
  next_run?: string;
  agent_id?: string;
}

interface CronCalendarProps {
  jobs: CronJob[];
}

// Agent color map for visual distinction
const AGENT_COLORS: Record<string, string> = {
  ceo: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cfo: 'bg-green-500/20 text-green-400 border-green-500/30',
  cmo: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cto: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  coo: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hr: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  legal: 'bg-red-500/20 text-red-400 border-red-500/30',
  strategy: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  knowledge: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  neo: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

function getAgentColor(agentId: string): string {
  const key = agentId.toLowerCase().replace(/^agent[-_]?/, '');
  return AGENT_COLORS[key] || 'bg-mc-bg-tertiary text-mc-text-secondary border-mc-border';
}

/**
 * Parse a single cron field (minute, hour, dom, month, dow) and return
 * matching values within min..max range.
 */
function parseCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    // Handle step values: */N or range/N
    const [base, stepStr] = trimmed.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (base === '*') {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (base.includes('-')) {
      const [lo, hi] = base.split('-').map(Number);
      for (let i = lo; i <= hi; i += step) values.add(i);
    } else {
      values.add(parseInt(base, 10));
    }
  }

  return Array.from(values).filter((v) => v >= min && v <= max);
}

/**
 * Check if a cron job runs on a given date.
 * Handles standard 5-field cron: minute hour dom month dow
 */
function cronMatchesDate(schedule: string, date: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [, , domField, monthField, dowField] = parts;

  const month = date.getMonth() + 1; // 1-12
  const dom = date.getDate(); // 1-31
  const dow = date.getDay(); // 0-6

  // Check month
  const months = parseCronField(monthField, 1, 12);
  if (!months.includes(month)) return false;

  // Cron spec: if both dom and dow are restricted (not *), either can match
  const domIsWild = domField === '*';
  const dowIsWild = dowField === '*';

  if (domIsWild && dowIsWild) return true;

  const domMatch = domIsWild || parseCronField(domField, 1, 31).includes(dom);
  const dowMatch = dowIsWild || parseCronField(dowField, 0, 6).includes(dow);

  // Standard cron: if both are specified, either match triggers
  if (!domIsWild && !dowIsWild) return domMatch || dowMatch;

  return domMatch && dowMatch;
}

/**
 * Get the run times for a cron job on a specific date.
 * Returns array of "HH:mm" strings.
 */
function getCronTimesOnDate(schedule: string, date: Date): string[] {
  if (!cronMatchesDate(schedule, date)) return [];

  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return [];

  const [minField, hourField] = parts;
  const minutes = parseCronField(minField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);

  const times: string[] = [];
  for (const h of hours) {
    for (const m of minutes) {
      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return times.sort();
}

export function CronCalendar({ jobs }: CronCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const enabledJobs = jobs.filter(
    (j) => j.enabled === true || j.enabled === 1,
  );

  // Generate calendar days (including overflow from adjacent months)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Map each day to its matching jobs
  const dayJobsMap = useMemo(() => {
    const map = new Map<string, { job: CronJob; times: string[] }[]>();
    for (const day of calendarDays) {
      const key = format(day, 'yyyy-MM-dd');
      const matches: { job: CronJob; times: string[] }[] = [];
      for (const job of enabledJobs) {
        const times = getCronTimesOnDate(job.schedule, day);
        if (times.length > 0) {
          matches.push({ job, times });
        }
      }
      map.set(key, matches);
    }
    return map;
  }, [calendarDays, enabledJobs]);

  const selectedDayKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedDayJobs = selectedDayKey
    ? dayJobsMap.get(selectedDayKey) || []
    : [];

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-mc-accent-cyan" />
          <h2 className="text-lg font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <span className="text-xs bg-mc-bg-tertiary px-2 py-0.5 rounded text-mc-text-secondary">
            {enabledJobs.length} active
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-2 py-1 text-xs rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-px text-center text-xs text-mc-text-secondary uppercase font-medium">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-mc-border rounded overflow-hidden">
        {calendarDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayJobs = dayJobsMap.get(key) || [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = selectedDay && isSameDay(day, selectedDay);

          return (
            <button
              key={key}
              onClick={() => setSelectedDay(day)}
              className={`
                min-h-[80px] p-1.5 text-left flex flex-col
                ${inMonth ? 'bg-mc-bg-secondary' : 'bg-mc-bg'}
                ${selected ? 'ring-1 ring-mc-accent ring-inset' : ''}
                hover:bg-mc-bg-tertiary transition-colors
              `}
            >
              <span
                className={`
                  text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full
                  ${today ? 'bg-mc-accent text-white' : ''}
                  ${!inMonth ? 'text-mc-text-secondary/50' : 'text-mc-text'}
                `}
              >
                {format(day, 'd')}
              </span>

              {/* Job pills */}
              <div className="mt-1 space-y-0.5 overflow-hidden flex-1">
                {dayJobs.slice(0, 3).map(({ job }) => {
                  const agentId = job.agentId || job.agent_id || '';
                  return (
                    <div
                      key={job.id}
                      className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${getAgentColor(agentId)}`}
                      title={`${job.name} (${agentId}) — ${job.schedule}`}
                    >
                      {job.name.replace(/^(vw-|bdi-|sync-)/, '')}
                    </div>
                  );
                })}
                {dayJobs.length > 3 && (
                  <div className="text-[10px] text-mc-text-secondary px-1">
                    +{dayJobs.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail panel */}
      {selectedDay && (
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-mc-accent" />
            {format(selectedDay, 'EEEE, MMMM d, yyyy')}
            <span className="text-xs text-mc-text-secondary font-normal">
              {selectedDayJobs.length} job{selectedDayJobs.length !== 1 ? 's' : ''}
            </span>
          </h3>

          {selectedDayJobs.length === 0 ? (
            <p className="text-sm text-mc-text-secondary">
              No cron jobs scheduled for this day.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedDayJobs.map(({ job, times }) => {
                const agentId = job.agentId || job.agent_id || '';
                return (
                  <div
                    key={job.id}
                    className="flex items-start gap-3 bg-mc-bg rounded p-2.5 border border-mc-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {job.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${getAgentColor(agentId)}`}
                        >
                          {agentId}
                        </span>
                      </div>
                      <div className="text-xs text-mc-text-secondary mt-1 font-mono">
                        {job.schedule}
                      </div>
                      <div className="text-xs text-mc-text-secondary mt-1">
                        {job.action}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-mc-text-secondary uppercase mb-1">
                        Runs at
                      </div>
                      <div className="space-y-0.5">
                        {times.slice(0, 6).map((t) => (
                          <div
                            key={t}
                            className="text-xs font-mono text-mc-accent"
                          >
                            {t}
                          </div>
                        ))}
                        {times.length > 6 && (
                          <div className="text-[10px] text-mc-text-secondary">
                            +{times.length - 6} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(AGENT_COLORS).map(([agent, cls]) => {
          const hasJobs = enabledJobs.some(
            (j) =>
              (j.agentId || j.agent_id || '')
                .toLowerCase()
                .replace(/^agent[-_]?/, '') === agent,
          );
          if (!hasJobs) return null;
          return (
            <div
              key={agent}
              className={`px-2 py-0.5 rounded border ${cls}`}
            >
              {agent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
