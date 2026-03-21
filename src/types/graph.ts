export interface GraphNode {
  id: string;
  label: string;
  type: 'agent' | 'goal' | 'plan' | 'task' | 'campaign' | 'initiative' | 'skill' | 'desire' | 'intention';
  status?: string;
  agent?: string;
  tier?: number;
  color?: string;
  val?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphFilters {
  showAgents: boolean;
  showGoals: boolean;
  showPlans: boolean;
  showTasks: boolean;
  showCampaigns: boolean;
  showInitiatives: boolean;
  showSkills: boolean;
  showDesires: boolean;
  showIntentions: boolean;
  selectedAgent: string | null;
}
