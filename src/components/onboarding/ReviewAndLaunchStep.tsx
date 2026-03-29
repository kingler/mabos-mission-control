'use client';

import { useState } from 'react';
import { Rocket, Loader2 } from 'lucide-react';
import { PipelineProgress } from './PipelineProgress';
import type { OnboardingState, DecompositionStage } from '@/lib/store';

interface ReviewAndLaunchStepProps {
  state: OnboardingState;
  onLaunch: () => Promise<void>;
}

const BMC_LABELS: Record<string, string> = {
  key_partners: 'Key Partners',
  key_activities: 'Key Activities',
  key_resources: 'Key Resources',
  value_propositions: 'Value Propositions',
  customer_relationships: 'Customer Relationships',
  channels: 'Channels',
  customer_segments: 'Customer Segments',
  cost_structure: 'Cost Structure',
  revenue_streams: 'Revenue Streams',
};

export function ReviewAndLaunchStep({ state, onLaunch }: ReviewAndLaunchStepProps) {
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLaunching(true);
    setError(null);
    try {
      await onLaunch();
      setLaunched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  // Show pipeline progress if launched
  if (launched) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Building Your Strategic Goal Tree</h2>
        <PipelineProgress
          stages={state.pipelineStages}
          pipelineRunId={state.pipelineRunId}
          workspaceSlug={state.workspaceSlug}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Review & Launch</h2>
      <p className="text-mc-text-secondary mb-6">
        Review your business profile, then launch the AI-powered goal decomposition pipeline.
      </p>

      <div className="max-w-3xl space-y-6">
        {/* Business Overview */}
        <Section title="Business Overview">
          <Row label="Name" value={state.businessName} />
          <Row label="Type" value={state.businessType} />
          <Row label="Industry" value={state.industry} />
          <Row label="Stage" value={state.companyStage} />
          <Row label="Revenue" value={state.currentRevenue || 'Not specified'} />
          <Row label="Team Size" value={String(state.teamSize)} />
          <Row label="Products" value={state.keyProducts || 'Not specified'} />
          <Row label="Channels" value={state.primaryChannels || 'Not specified'} />
        </Section>

        {/* Vision & Mission */}
        <Section title="Vision & Mission">
          <div className="space-y-2">
            <div>
              <span className="text-xs font-medium text-mc-text-secondary uppercase">Vision</span>
              <p className="text-sm text-mc-text italic">{state.vision || 'Not set'}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-mc-text-secondary uppercase">Mission</span>
              <p className="text-sm text-mc-text italic">{state.mission || 'Not set'}</p>
            </div>
          </div>
        </Section>

        {/* Core Values */}
        <Section title="Core Values">
          <div className="flex flex-wrap gap-2">
            {state.coreValues.length > 0
              ? state.coreValues.map((v, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-mc-accent/10 border border-mc-accent/30 text-mc-accent text-xs">
                    {v}
                  </span>
                ))
              : <span className="text-sm text-mc-text-secondary">None set</span>
            }
          </div>
        </Section>

        {/* BMC Summary */}
        <Section title="Business Model Canvas">
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(state.bmc).map(([key, val]) => (
              <div key={key} className="p-2 rounded bg-mc-bg border border-mc-border">
                <span className="text-xs font-medium text-mc-text-secondary">{BMC_LABELS[key] || key}</span>
                <p className="text-xs text-mc-text mt-1 line-clamp-3 whitespace-pre-line">{val || 'Not set'}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Launch Button */}
        <div className="pt-4 border-t border-mc-border">
          <p className="text-sm text-mc-text-secondary mb-4">
            Clicking Launch will create your workspace, generate agents, and run the full 7-stage goal decomposition pipeline using KAOS, Tropos, HTN, and GO-BPMN methodologies.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-mc-accent-red/10 border border-mc-accent-red/30 text-mc-accent-red text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={launching}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-mc-accent text-mc-bg font-bold text-lg hover:bg-mc-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {launching ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Rocket className="w-5 h-5" />
            )}
            {launching ? 'Launching...' : 'Launch'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg bg-mc-bg-secondary border border-mc-border">
      <h3 className="text-sm font-bold text-mc-text mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="text-xs font-medium text-mc-text-secondary w-24 shrink-0">{label}</span>
      <span className="text-sm text-mc-text">{value}</span>
    </div>
  );
}
