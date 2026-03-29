'use client';

import { AiGenerateButton } from './AiGenerateButton';

interface MissionStepProps {
  mission: string;
  context: Record<string, unknown>;
  onUpdate: (value: string) => void;
}

export function MissionStep({ mission, context, onUpdate }: MissionStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Mission Statement</h2>
      <p className="text-mc-text-secondary mb-6">
        Your mission defines what your business does today, who it serves, and how it delivers value.
      </p>

      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-mc-text">Mission</label>
          <AiGenerateButton
            type="mission"
            context={context}
            onResult={(result) => onUpdate(String(result))}
            label="Generate Mission"
          />
        </div>

        <textarea
          value={mission}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder="e.g., We curate and deliver exceptional wall art that brings joy and inspiration to homes and spaces worldwide..."
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none resize-none"
        />

        {mission && (
          <div className="p-4 rounded-lg bg-mc-accent/5 border border-mc-accent/20">
            <p className="text-sm text-mc-text italic">&ldquo;{mission}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
