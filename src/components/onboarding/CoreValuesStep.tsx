'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { AiGenerateButton } from './AiGenerateButton';

interface CoreValuesStepProps {
  coreValues: string[];
  context: Record<string, unknown>;
  onUpdate: (values: string[]) => void;
}

export function CoreValuesStep({ coreValues, context, onUpdate }: CoreValuesStepProps) {
  const [customValue, setCustomValue] = useState('');

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !coreValues.includes(trimmed) && coreValues.length < 7) {
      onUpdate([...coreValues, trimmed]);
    }
  };

  const removeValue = (index: number) => {
    onUpdate(coreValues.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addValue(customValue);
      setCustomValue('');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Core Values</h2>
      <p className="text-mc-text-secondary mb-6">
        Select up to 7 core values that define your company culture. AI can suggest values based on your business profile.
      </p>

      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-mc-text">
            Values ({coreValues.length}/7)
          </label>
          <AiGenerateButton
            type="values"
            context={context}
            onResult={(result) => {
              if (Array.isArray(result)) {
                onUpdate(result.slice(0, 7));
              }
            }}
            label="Suggest Values"
            disabled={coreValues.length >= 7}
          />
        </div>

        {/* Current values */}
        <div className="flex flex-wrap gap-2 min-h-[48px]">
          {coreValues.map((value, i) => (
            <span
              key={`${value}-${i}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-mc-accent/10 border border-mc-accent/30 text-mc-accent text-sm"
            >
              {value}
              <button
                onClick={() => removeValue(i)}
                className="hover:text-mc-accent-red transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          {coreValues.length === 0 && (
            <span className="text-sm text-mc-text-secondary italic">
              No values yet. Generate suggestions or add your own below.
            </span>
          )}
        </div>

        {/* Custom value input */}
        {coreValues.length < 7 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a custom value and press Enter..."
              className="flex-1 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none"
            />
            <button
              onClick={() => {
                addValue(customValue);
                setCustomValue('');
              }}
              disabled={!customValue.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-mc-border text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
