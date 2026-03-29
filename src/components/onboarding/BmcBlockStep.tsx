'use client';

import { AiGenerateButton } from './AiGenerateButton';

const BMC_INFO: Record<string, { title: string; description: string; placeholder: string }> = {
  key_partners: {
    title: 'Key Partners',
    description: 'Who are your key partners and suppliers? What resources do they provide?',
    placeholder: '- Print-on-demand partner (e.g., Pictorem)\n- Canvas & framing suppliers\n- Shipping/logistics partners',
  },
  key_activities: {
    title: 'Key Activities',
    description: 'What key activities does your value proposition require?',
    placeholder: '- Artwork curation and creation\n- E-commerce platform management\n- Marketing and customer acquisition',
  },
  key_resources: {
    title: 'Key Resources',
    description: 'What key resources does your value proposition require?',
    placeholder: '- Original artwork catalog\n- Shopify e-commerce platform\n- Brand and social media presence',
  },
  value_propositions: {
    title: 'Value Propositions',
    description: 'What value do you deliver to the customer? Which problems do you solve?',
    placeholder: '- Unique, high-quality wall art\n- Curated collections for different styles\n- Limited edition exclusivity',
  },
  customer_relationships: {
    title: 'Customer Relationships',
    description: 'What type of relationship does each customer segment expect?',
    placeholder: '- Personalized recommendations\n- Email newsletters with new releases\n- Social media engagement',
  },
  channels: {
    title: 'Channels',
    description: 'Through which channels do your customer segments want to be reached?',
    placeholder: '- Shopify online store\n- Instagram & Pinterest\n- Email marketing\n- Interior designer referrals',
  },
  customer_segments: {
    title: 'Customer Segments',
    description: 'For whom are you creating value? Who are your most important customers?',
    placeholder: '- Art-loving homeowners\n- Interior designers\n- Commercial spaces (hotels, offices)',
  },
  cost_structure: {
    title: 'Cost Structure',
    description: 'What are the most important costs inherent in your business model?',
    placeholder: '- Print production & shipping costs\n- Marketing & advertising spend\n- Platform fees (Shopify, payment processing)',
  },
  revenue_streams: {
    title: 'Revenue Streams',
    description: 'For what value are your customers willing to pay?',
    placeholder: '- Standard canvas print sales\n- Limited edition premium prints\n- Custom/commissioned artwork\n- Designer trade program',
  },
};

interface BmcBlockStepProps {
  blockKey: string;
  value: string;
  context: Record<string, unknown>;
  onUpdate: (value: string) => void;
}

export function BmcBlockStep({ blockKey, value, context, onUpdate }: BmcBlockStepProps) {
  const info = BMC_INFO[blockKey] || { title: blockKey, description: '', placeholder: '' };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">BMC: {info.title}</h2>
      <p className="text-mc-text-secondary mb-6">{info.description}</p>

      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-mc-text">{info.title}</label>
          <AiGenerateButton
            type="bmc_block"
            context={context}
            blockName={info.title}
            onResult={(result) => onUpdate(String(result))}
            label="Suggest"
          />
        </div>

        <textarea
          value={value}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder={info.placeholder}
          rows={6}
          className="w-full px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text placeholder:text-mc-text-secondary/50 focus:border-mc-accent focus:outline-none resize-none font-mono text-sm"
        />
      </div>
    </div>
  );
}
