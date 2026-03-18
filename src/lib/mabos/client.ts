/**
 * MABOS REST API Client
 * Wraps MABOS API at /mabos/api/* via the OpenClaw Gateway
 */

import type {
  MabosAgent,
  MabosAgentDetail,
  MabosAgentFile,
  MabosAgentFileContent,
  MabosTask,
  CreateMabosTaskInput,
  MabosDecision,
  DecisionResolution,
  MabosBusiness,
  TroposGoalModel,
  MabosCronJob,
  BdiCycleResult,
  AgentCognitiveActivity,
} from './types';

const REQUEST_TIMEOUT_MS = 30_000;

export class MabosApiClient {
  private baseUrl: string;
  private authToken: string | undefined;

  constructor(baseUrl?: string, authToken?: string) {
    this.baseUrl = baseUrl || process.env.MABOS_API_URL || 'http://127.0.0.1:18789';
    this.authToken = authToken || process.env.OPENCLAW_GATEWAY_TOKEN;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> || {}),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const res = await fetch(`${this.baseUrl}/mabos/api${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`MABOS API ${res.status}: ${path} - ${body}`);
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        // Some endpoints return plain text
        const text = await res.text();
        return text as unknown as T;
      }

      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // ─── Agents ───

  async getAgents(businessId: string): Promise<MabosAgent[]> {
    const res = await this.get<{ agents: MabosAgent[] }>(`/businesses/${businessId}/agents`);
    return res.agents || [];
  }

  async getAgentDetail(agentId: string): Promise<MabosAgentDetail> {
    return this.get<MabosAgentDetail>(`/agents/${agentId}`);
  }

  async getAgentFiles(agentId: string): Promise<MabosAgentFile[]> {
    const res = await this.get<{ files: MabosAgentFile[] }>(`/agents/${agentId}/files`);
    return res.files || [];
  }

  async getAgentFile(agentId: string, filename: string): Promise<MabosAgentFileContent> {
    return this.get<MabosAgentFileContent>(`/agents/${agentId}/files/${encodeURIComponent(filename)}`);
  }

  // ─── Tasks ───

  async getTasks(businessId: string): Promise<MabosTask[]> {
    const res = await this.get<{ tasks: MabosTask[] }>(`/businesses/${businessId}/tasks`);
    return res.tasks || [];
  }

  async createTask(businessId: string, task: CreateMabosTaskInput): Promise<{ ok: boolean }> {
    return this.post<{ ok: boolean }>(`/businesses/${businessId}/tasks`, task);
  }

  async updateTask(businessId: string, taskId: string, update: Partial<MabosTask>): Promise<void> {
    await this.put(`/businesses/${businessId}/tasks/${taskId}`, update);
  }

  // ─── Business Data ───

  async getGoals(businessId: string): Promise<TroposGoalModel> {
    return this.get<TroposGoalModel>(`/businesses/${businessId}/goals`);
  }

  async getMetrics(businessId: string): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/metrics/${businessId}`);
  }

  async getDecisions(): Promise<MabosDecision[]> {
    const res = await this.get<{ decisions: MabosDecision[] }>('/decisions');
    return res.decisions || [];
  }

  async resolveDecision(id: string, body: DecisionResolution): Promise<{ ok: boolean }> {
    return this.post<{ ok: boolean }>(`/decisions/${id}/resolve`, body);
  }

  async getBusinesses(): Promise<MabosBusiness[]> {
    const res = await this.get<{ businesses: MabosBusiness[] }>('/businesses');
    return res.businesses || [];
  }

  // ─── BDI + Cron ───

  async triggerBdiCycle(businessId: string, agentId: string): Promise<BdiCycleResult> {
    return this.post<BdiCycleResult>('/bdi/cycle', { businessId, agentId });
  }

  async getCronJobs(businessId: string): Promise<MabosCronJob[]> {
    const res = await this.get<{ jobs: MabosCronJob[] }>(`/businesses/${businessId}/cron`);
    return res.jobs || [];
  }

  async updateCronJob(businessId: string, jobId: string, update: Partial<MabosCronJob>): Promise<void> {
    await this.put(`/businesses/${businessId}/cron/${jobId}`, update);
  }

  async triggerCronJob(businessId: string, jobId: string): Promise<void> {
    await this.post(`/businesses/${businessId}/cron/${jobId}/trigger`);
  }


  // ─── Activities ───

  async getActivities(agentId: string, opts?: { category?: string; limit?: number; since?: string }): Promise<AgentCognitiveActivity[]> {
    const params = new URLSearchParams();
    if (opts?.category) params.set('category', opts.category);
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.since) params.set('since', opts.since);
    const res = await this.get<{ activities: AgentCognitiveActivity[] }>(`/agents/${agentId}/activities?${params}`);
    return res.activities || [];
  }

  // ─── Status ───

  async getStatus(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>('/status');
  }
}
