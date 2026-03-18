/**
 * MABOS Event Bridge
 * Subscribes to MABOS events via the existing OpenClaw WebSocket connection
 * and forwards them to Mission Control's SSE broadcast system
 */

import type { OpenClawClient } from '../openclaw/client';
import type { MabosSSEEvent } from './types';

type BroadcastFn = (event: MabosSSEEvent) => void;

export class MabosEventBridge {
  private openclawClient: OpenClawClient;
  private broadcastEvent: BroadcastFn;
  private listeners: Map<string, ((...args: any[]) => void)> = new Map();
  private started = false;

  constructor(openclawClient: OpenClawClient, broadcastEvent: BroadcastFn) {
    this.openclawClient = openclawClient;
    this.broadcastEvent = broadcastEvent;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Listen for gateway notification events that are MABOS-related
    const notificationHandler = (...args: any[]) => {
      const data = args[0] as Record<string, unknown>;
      const method = data?.method as string;
      const params = data?.params as Record<string, unknown>;

      if (!method) return;

      // Map gateway notifications to MC SSE events
      if (method.startsWith('agent.') || method === 'agents.updated') {
        this.broadcastEvent({
          type: 'mabos:agent_update',
          payload: { method, ...params },
        });
      } else if (method.startsWith('cron.') || method === 'cron.executed') {
        this.broadcastEvent({
          type: 'mabos:cron_executed',
          payload: { method, ...params },
        });
      } else if (method.startsWith('task.') || method === 'tasks.created') {
        this.broadcastEvent({
          type: 'mabos:task_created',
          payload: { method, ...params },
        });
      } else if (method.startsWith('decision.')) {
        this.broadcastEvent({
          type: 'mabos:decision_pending',
          payload: { method, ...params },
        });
      } else if (method === 'activity' || method.startsWith('activity.')) {
        this.broadcastEvent({
          type: 'mabos:activity',
          payload: params || {},
        });
      }
    };

    this.openclawClient.on('notification', notificationHandler);
    this.listeners.set('notification', notificationHandler);

    // Also listen for 'agent' events with stream='activity' (from emitAgentEvent)
    const agentEventHandler = (...args: any[]) => {
      const data = args[0] as Record<string, unknown>;
      if (data?.event === 'agent' && data?.payload) {
        const payload = data.payload as Record<string, unknown>;
        if (payload?.stream === 'activity' && payload?.data) {
          this.broadcastEvent({
            type: 'mabos:activity',
            payload: payload.data as Record<string, unknown>,
          });
        }
      }
    };

    this.openclawClient.on('event', agentEventHandler);
    this.listeners.set('event', agentEventHandler);

    console.log('[MabosEventBridge] Started listening for MABOS events');
  }

  stop(): void {
    if (!this.started) return;

    for (const [event, handler] of Array.from(this.listeners)) {
      this.openclawClient.removeListener(event, handler);
    }
    this.listeners.clear();
    this.started = false;

    console.log('[MabosEventBridge] Stopped');
  }

  isRunning(): boolean {
    return this.started;
  }
}
