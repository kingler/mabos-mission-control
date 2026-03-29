'use client';

interface CompanyOverviewStepProps {
  businessName: string;
  industry: string;
  description: string;
  companyStage: string;
  currentRevenue: string;
  teamSize: number;
  keyProducts: string;
  primaryChannels: string;
  constraints: string;
  onUpdate: (field: string, value: unknown) => void;
}

const INDUSTRIES = [
  'Art & Home Decor', 'Fashion & Apparel', 'Food & Beverage', 'Health & Wellness',
  'Technology', 'Education', 'Finance & Banking', 'Real Estate',
  'Entertainment & Media', 'Travel & Hospitality', 'Automotive', 'Manufacturing',
  'Agriculture', 'Energy', 'Retail', 'Professional Services', 'Non-Profit', 'Other',
];

const STAGES = [
  { value: 'idea', label: 'Idea Stage' },
  { value: 'startup', label: 'Startup (Pre-revenue)' },
  { value: 'early', label: 'Early Revenue' },
  { value: 'growth', label: 'Growth' },
  { value: 'scale', label: 'Scale' },
  { value: 'mature', label: 'Mature' },
];

export function CompanyOverviewStep(props: CompanyOverviewStepProps) {
  const { onUpdate } = props;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Tell us about your business</h2>
      <p className="text-mc-text-secondary mb-6">Basic details to tailor the AI-generated strategy.</p>

      <div className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-mc-text mb-1">Business Name *</label>
          <input
            type="text"
            value={props.businessName}
            onChange={(e) => onUpdate('businessName', e.target.value)}
            placeholder="e.g., VividWalls"
            className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-mc-text mb-1">Industry *</label>
            <select
              value={props.industry}
              onChange={(e) => onUpdate('industry', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text focus:border-mc-accent focus:outline-none"
            >
              <option value="">Select...</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-mc-text mb-1">Company Stage</label>
            <select
              value={props.companyStage}
              onChange={(e) => onUpdate('companyStage', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text focus:border-mc-accent focus:outline-none"
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-mc-text mb-1">Description *</label>
          <textarea
            value={props.description}
            onChange={(e) => onUpdate('description', e.target.value)}
            placeholder="Describe what your business does, who it serves, and what makes it unique..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-mc-text mb-1">Current Revenue</label>
            <input
              type="text"
              value={props.currentRevenue}
              onChange={(e) => onUpdate('currentRevenue', e.target.value)}
              placeholder="e.g., $3,498/mo"
              className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-mc-text mb-1">Team Size</label>
            <input
              type="number"
              value={props.teamSize}
              onChange={(e) => onUpdate('teamSize', parseInt(e.target.value) || 1)}
              min={1}
              className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text focus:border-mc-accent focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-mc-text mb-1">Key Products/Services</label>
          <input
            type="text"
            value={props.keyProducts}
            onChange={(e) => onUpdate('keyProducts', e.target.value)}
            placeholder="e.g., Canvas prints, limited editions, custom artwork"
            className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-mc-text mb-1">Primary Channels</label>
          <input
            type="text"
            value={props.primaryChannels}
            onChange={(e) => onUpdate('primaryChannels', e.target.value)}
            placeholder="e.g., Shopify store, Instagram, Pinterest, email"
            className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-mc-text mb-1">Key Constraints</label>
          <input
            type="text"
            value={props.constraints}
            onChange={(e) => onUpdate('constraints', e.target.value)}
            placeholder="e.g., Solo founder, limited budget, bootstrapped"
            className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
