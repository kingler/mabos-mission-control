'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface AiGenerateButtonProps {
  type: 'vision' | 'mission' | 'values' | 'bmc_block';
  context: Record<string, unknown>;
  blockName?: string;
  onResult: (result: unknown) => void;
  label?: string;
  disabled?: boolean;
}

export function AiGenerateButton({
  type,
  context,
  blockName,
  onResult,
  label = 'Generate with AI',
  disabled = false,
}: AiGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, context, blockName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      onResult(data.result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={disabled || loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-mc-accent/30 text-mc-accent text-sm hover:bg-mc-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {loading ? 'Generating...' : label}
      </button>
      {error && (
        <p className="mt-1 text-xs text-mc-accent-red">{error}</p>
      )}
    </div>
  );
}
