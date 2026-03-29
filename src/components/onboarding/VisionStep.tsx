'use client';

import { AiGenerateButton } from './AiGenerateButton';

interface VisionStepProps {
  vision: string;
  context: Record<string, unknown>;
  onUpdate: (value: string) => void;
}

export function VisionStep({ vision, context, onUpdate }: VisionStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Vision Statement</h2>
      <p className="text-mc-text-secondary mb-6">
        Your vision describes the future state your business aspires to create. Use AI to generate a starting point, then edit as needed.
      </p>

      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-mc-text">Vision</label>
          <AiGenerateButton
            type="vision"
            context={context}
            onResult={(result) => onUpdate(String(result))}
            label="Generate Vision"
          />
        </div>

        <textarea
          value={vision}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder="e.g., To become the world's most beloved destination for wall art that transforms any space into a gallery..."
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none resize-none"
        />

        {vision && (
          <div className="p-4 rounded-lg bg-mc-accent/5 border border-mc-accent/20">
            <p className="text-sm text-mc-text italic">&ldquo;{vision}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
