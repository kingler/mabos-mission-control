'use client';

import { useCallback, useEffect } from 'react';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import { StepNavigation } from '@/components/onboarding/StepNavigation';
import { BusinessTypeStep } from '@/components/onboarding/BusinessTypeStep';
import { CompanyOverviewStep } from '@/components/onboarding/CompanyOverviewStep';
import { VisionStep } from '@/components/onboarding/VisionStep';
import { MissionStep } from '@/components/onboarding/MissionStep';
import { CoreValuesStep } from '@/components/onboarding/CoreValuesStep';
import { BmcBlockStep } from '@/components/onboarding/BmcBlockStep';
import { ReviewAndLaunchStep } from '@/components/onboarding/ReviewAndLaunchStep';

const BMC_BLOCKS = [
  'key_partners',
  'key_activities',
  'key_resources',
  'value_propositions',
  'customer_relationships',
  'channels',
  'customer_segments',
  'cost_structure',
  'revenue_streams',
];

const STEP_LABELS = [
  'Business Type',
  'Company Overview',
  'Vision',
  'Mission',
  'Core Values',
  ...BMC_BLOCKS.map((_, i) => `BMC ${i + 1}/9`),
  'Review & Launch',
];

export default function OnboardPage() {
  const { onboarding: state, onboardingActions: actions } = useMissionControl();

  // Connect SSE for pipeline progress updates
  useSSE();

  // Reset on mount
  useEffect(() => {
    // Only reset if not mid-pipeline
    if (!state.pipelineRunId) {
      actions.resetOnboarding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { step } = state;
  const totalSteps = 15;

  const canProceed = useCallback(() => {
    switch (step) {
      case 1: return !!state.businessType;
      case 2: return !!state.businessName && !!state.industry && !!state.description;
      default: return true;
    }
  }, [step, state.businessType, state.businessName, state.industry, state.description]);

  const goNext = () => {
    if (step < totalSteps && canProceed()) {
      actions.setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 1) {
      actions.setStep(step - 1);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && step < totalSteps) {
        const target = e.target as HTMLElement;
        // Don't intercept Enter in textareas
        if (target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          goNext();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // AI generation context shared across steps
  const aiContext = {
    businessName: state.businessName,
    businessType: state.businessType,
    industry: state.industry,
    description: state.description,
    companyStage: state.companyStage,
    vision: state.vision,
    mission: state.mission,
  };

  const handleLaunch = async () => {
    // 1. Create workspace + business profile
    const completeRes = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });

    if (!completeRes.ok) {
      const data = await completeRes.json().catch(() => ({}));
      throw new Error(data.error || `Workspace creation failed (${completeRes.status})`);
    }

    const { workspaceId, profileId, slug } = await completeRes.json();
    actions.updateField('workspaceId', workspaceId);
    actions.updateField('workspaceSlug', slug);

    // 2. Initialize pipeline stages in store
    actions.setPipelineStages(
      Array.from({ length: 7 }, (_, i) => ({
        stageNumber: i + 1,
        stageName: STEP_LABELS[i] || `Stage ${i + 1}`,
        status: 'pending' as const,
      }))
    );

    // 3. Start pipeline
    const pipeRes = await fetch('/api/onboarding/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, profileId }),
    });

    if (!pipeRes.ok) {
      const data = await pipeRes.json().catch(() => ({}));
      throw new Error(data.error || `Pipeline start failed (${pipeRes.status})`);
    }

    const { pipelineRunId } = await pipeRes.json();
    actions.updateField('pipelineRunId', pipelineRunId);
  };

  const renderStep = () => {
    // Step 1: Business Type
    if (step === 1) {
      return (
        <BusinessTypeStep
          selected={state.businessType}
          onSelect={(type) => actions.updateField('businessType', type)}
        />
      );
    }

    // Step 2: Company Overview
    if (step === 2) {
      return (
        <CompanyOverviewStep
          businessName={state.businessName}
          industry={state.industry}
          description={state.description}
          companyStage={state.companyStage}
          currentRevenue={state.currentRevenue}
          teamSize={state.teamSize}
          keyProducts={state.keyProducts}
          primaryChannels={state.primaryChannels}
          constraints={state.constraints}
          onUpdate={(field, value) => actions.updateField(field as keyof typeof state, value)}
        />
      );
    }

    // Step 3: Vision
    if (step === 3) {
      return (
        <VisionStep
          vision={state.vision}
          context={aiContext}
          onUpdate={(v) => actions.updateField('vision', v)}
        />
      );
    }

    // Step 4: Mission
    if (step === 4) {
      return (
        <MissionStep
          mission={state.mission}
          context={aiContext}
          onUpdate={(v) => actions.updateField('mission', v)}
        />
      );
    }

    // Step 5: Core Values
    if (step === 5) {
      return (
        <CoreValuesStep
          coreValues={state.coreValues}
          context={aiContext}
          onUpdate={(v) => actions.updateField('coreValues', v)}
        />
      );
    }

    // Steps 6-14: BMC blocks
    if (step >= 6 && step <= 14) {
      const blockIndex = step - 6;
      const blockKey = BMC_BLOCKS[blockIndex];
      return (
        <BmcBlockStep
          blockKey={blockKey}
          value={state.bmc[blockKey] || ''}
          context={aiContext}
          onUpdate={(v) => actions.setBmc(blockKey, v)}
        />
      );
    }

    // Step 15: Review & Launch
    if (step === 15) {
      return (
        <ReviewAndLaunchStep
          state={state}
          onLaunch={handleLaunch}
        />
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-mc-bg flex">
      {/* Sidebar - Step Progress */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-mc-border bg-mc-bg-secondary p-4">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl">🦞</span>
          <span className="font-bold text-mc-text">Onboard</span>
        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const isCurrent = stepNum === step;
            const isDone = stepNum < step;

            return (
              <button
                key={i}
                onClick={() => {
                  // Allow jumping to completed steps
                  if (isDone) actions.setStep(stepNum);
                }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isCurrent
                    ? 'bg-mc-accent/10 text-mc-accent font-medium'
                    : isDone
                      ? 'text-mc-accent-green hover:bg-mc-bg-tertiary cursor-pointer'
                      : 'text-mc-text-secondary/50 cursor-default'
                }`}
              >
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-mono border ${
                  isCurrent
                    ? 'border-mc-accent text-mc-accent'
                    : isDone
                      ? 'border-mc-accent-green text-mc-accent-green bg-mc-accent-green/10'
                      : 'border-mc-border text-mc-text-secondary/40'
                }`}>
                  {isDone ? '\u2713' : stepNum}
                </span>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Mobile step indicator */}
        <header className="lg:hidden border-b border-mc-border bg-mc-bg-secondary px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🦞</span>
            <span className="text-sm font-medium text-mc-text-secondary">
              Step {step} of {totalSteps}: {STEP_LABELS[step - 1]}
            </span>
          </div>
        </header>

        <div className="flex-1 p-6 sm:p-8 lg:p-12 overflow-y-auto">
          {renderStep()}
        </div>

        {/* Navigation (hide on step 15 when pipeline is running) */}
        {!(step === 15 && state.pipelineRunId) && (
          <div className="border-t border-mc-border bg-mc-bg-secondary px-6 sm:px-8 lg:px-12 py-4">
            <StepNavigation
              step={step}
              totalSteps={totalSteps}
              onBack={goBack}
              onNext={goNext}
              canProceed={canProceed()}
              nextLabel={step === 14 ? 'Review' : 'Next'}
              hideNext={step === 15}
            />
          </div>
        )}
      </main>
    </div>
  );
}
