'use client';

import { Store, Globe, Briefcase, ShoppingBag, Laptop, Building2, Palette, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

const BUSINESS_TYPES: { id: string; label: string; icon: ReactNode; description: string }[] = [
  { id: 'ecommerce', label: 'E-commerce', icon: <ShoppingBag className="w-6 h-6" />, description: 'Online retail & product sales' },
  { id: 'saas', label: 'SaaS', icon: <Laptop className="w-6 h-6" />, description: 'Software as a service' },
  { id: 'agency', label: 'Agency', icon: <Briefcase className="w-6 h-6" />, description: 'Services & consulting' },
  { id: 'marketplace', label: 'Marketplace', icon: <Store className="w-6 h-6" />, description: 'Platform connecting buyers & sellers' },
  { id: 'creative', label: 'Creative Studio', icon: <Palette className="w-6 h-6" />, description: 'Art, design & media' },
  { id: 'enterprise', label: 'Enterprise', icon: <Building2 className="w-6 h-6" />, description: 'B2B enterprise solutions' },
  { id: 'platform', label: 'Platform', icon: <Globe className="w-6 h-6" />, description: 'Digital platform / infrastructure' },
  { id: 'other', label: 'Other', icon: <Wrench className="w-6 h-6" />, description: 'Something else entirely' },
];

interface BusinessTypeStepProps {
  selected: string;
  onSelect: (type: string) => void;
}

export function BusinessTypeStep({ selected, onSelect }: BusinessTypeStepProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">What type of business are you building?</h2>
      <p className="text-mc-text-secondary mb-6">Select the category that best describes your business.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BUSINESS_TYPES.map((bt) => (
          <button
            key={bt.id}
            onClick={() => onSelect(bt.id)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
              selected === bt.id
                ? 'border-mc-accent bg-mc-accent/10 text-mc-accent'
                : 'border-mc-border bg-mc-bg-secondary hover:border-mc-text-secondary hover:bg-mc-bg-tertiary text-mc-text'
            }`}
          >
            {bt.icon}
            <span className="font-medium text-sm">{bt.label}</span>
            <span className="text-xs text-mc-text-secondary">{bt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
