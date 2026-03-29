'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface StepNavigationProps {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  canProceed?: boolean;
  nextLabel?: string;
  hideNext?: boolean;
}

export function StepNavigation({
  step,
  totalSteps,
  onBack,
  onNext,
  canProceed = true,
  nextLabel = 'Next',
  hideNext = false,
}: StepNavigationProps) {
  return (
    <div className="flex items-center justify-between pt-6 border-t border-mc-border">
      <button
        onClick={onBack}
        disabled={step <= 1}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-mc-border text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i + 1 === step
                ? 'bg-mc-accent'
                : i + 1 < step
                  ? 'bg-mc-accent-green'
                  : 'bg-mc-border'
            }`}
          />
        ))}
      </div>

      {!hideNext && (
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium hover:bg-mc-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {nextLabel}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
