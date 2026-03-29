'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle, ArrowRight } from 'lucide-react';
import type { DecompositionStage } from '@/lib/store';

const STAGE_DISPLAY = [
  { name: 'Goal Generation', desc: 'KAOS methodology — derive business goals from organizational DNA' },
  { name: 'Goal Refinement', desc: 'AND/OR decomposition trees with obstacles and softgoals' },
  { name: 'Project Scoping', desc: 'Tropos actor-dependency modeling — cluster into bounded projects' },
  { name: 'Plan Generation', desc: 'GO-BPMN context-conditioned plans with BDI architecture' },
  { name: 'Task Decomposition', desc: 'HTN planner — concrete tasks with ordering and dependencies' },
  { name: 'Action Generation', desc: 'Atomic actions mapped to tools and agent capabilities' },
  { name: 'Execution Assembly', desc: 'Final DAG with checkpoints, approval gates, and risk register' },
];

interface PipelineProgressProps {
  stages: DecompositionStage[];
  pipelineRunId: string | null;
  workspaceSlug: string | null;
}

export function PipelineProgress({ stages, pipelineRunId, workspaceSlug }: PipelineProgressProps) {
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback polling if SSE disconnects
  useEffect(() => {
    if (!pipelineRunId) return;

    const allDone = stages.every(s => s.status === 'completed' || s.status === 'failed');
    if (allDone && stages.length > 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    // Poll every 5s as fallback
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/onboarding/pipeline/status?runId=${pipelineRunId}`);
        if (!res.ok) return;
        // SSE should be primary; this is just a fallback
      } catch { /* ignore */ }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pipelineRunId, stages]);

  const isComplete = stages.length === 7 && stages.every(s => s.status === 'completed');
  const hasFailed = stages.some(s => s.status === 'failed');

  return (
    <div className="max-w-2xl">
      <h3 className="text-lg font-bold mb-4">
        {isComplete ? 'Pipeline Complete!' : hasFailed ? 'Pipeline Failed' : 'Running 7-Stage Decomposition...'}
      </h3>

      <div className="space-y-3">
        {STAGE_DISPLAY.map((display, i) => {
          const stage = stages[i];
          const status = stage?.status || 'pending';

          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                status === 'running'
                  ? 'border-mc-accent bg-mc-accent/5'
                  : status === 'completed'
                    ? 'border-mc-accent-green/30 bg-mc-accent-green/5'
                    : status === 'failed'
                      ? 'border-mc-accent-red/30 bg-mc-accent-red/5'
                      : 'border-mc-border bg-mc-bg-secondary'
              }`}
            >
              <div className="mt-0.5">
                {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-mc-accent-green" />}
                {status === 'running' && <Loader2 className="w-5 h-5 text-mc-accent animate-spin" />}
                {status === 'failed' && <XCircle className="w-5 h-5 text-mc-accent-red" />}
                {status === 'pending' && <Circle className="w-5 h-5 text-mc-text-secondary/40" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-mono text-mc-text-secondary">Stage {i + 1}</span>
                  <span className={`font-medium text-sm ${
                    status === 'running' ? 'text-mc-accent' :
                    status === 'completed' ? 'text-mc-accent-green' :
                    status === 'failed' ? 'text-mc-accent-red' :
                    'text-mc-text-secondary'
                  }`}>
                    {display.name}
                  </span>
                </div>
                <p className="text-xs text-mc-text-secondary mt-0.5">{display.desc}</p>
                {stage?.resultSummary && (
                  <p className="text-xs text-mc-accent-green mt-1 font-medium">{stage.resultSummary}</p>
                )}
                {stage?.error && (
                  <p className="text-xs text-mc-accent-red mt-1">{stage.error}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isComplete && workspaceSlug && (
        <a
          href={`/workspace/${workspaceSlug}`}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-mc-accent-green text-mc-bg font-bold hover:bg-mc-accent-green/90 transition-colors"
        >
          Go to Dashboard
          <ArrowRight className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
