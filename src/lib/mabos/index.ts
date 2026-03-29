/**
 * MABOS Integration Singleton
 * Initializes and manages the MABOS client, sync engine, and event bridge
 */

import type Database from 'better-sqlite3';
import { MabosApiClient } from './client';
import { MabosSyncEngine } from './sync-engine';
import { MabosEventBridge } from './event-bridge';
import { getOpenClawClient } from '../openclaw/client';
import { broadcast } from '../events';
import { getScheduler } from '../scheduler';
import type { MabosSSEEvent, SyncReport } from './types';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_BUSINESS_ID = 'vividwalls';

export interface MabosIntegration {
  client: MabosApiClient;
  syncEngine: MabosSyncEngine;
  eventBridge: MabosEventBridge;
  triggerSync: () => Promise<SyncReport>;
  getBusinessId: () => string;
}

let instance: MabosIntegration | null = null;
let syncTimer: NodeJS.Timeout | null = null;

export function getMabosIntegration(db: Database.Database): MabosIntegration {
  if (instance) return instance;

  const businessId = process.env.MABOS_BUSINESS_ID || DEFAULT_BUSINESS_ID;

  // Create API client
  const client = new MabosApiClient();

  // Create sync engine
  const syncEngine = new MabosSyncEngine(db, client, businessId);

  // Create event bridge using existing OpenClaw WS connection
  const openclawClient = getOpenClawClient();
  const eventBridge = new MabosEventBridge(
    openclawClient,
    (event: MabosSSEEvent) => {
      // Forward MABOS events through MC's SSE broadcast system
      broadcast(event as unknown as import('../types').SSEEvent);
    }
  );

  // Start event bridge
  eventBridge.start();

  // Initial sync (async, non-blocking)
  syncEngine.syncAll().then((report) => {
    console.log('[MABOS] Initial sync complete:', report);
    broadcast({
      type: 'mabos:sync_complete' as unknown as import('../types').SSEEventType,
      payload: report as unknown as Record<string, unknown>,
    } as unknown as import('../types').SSEEvent);
  }).catch((err) => {
    console.error('[MABOS] Initial sync failed:', err);
  });

  // Schedule periodic sync
  syncTimer = setInterval(async () => {
    try {
      const report = await syncEngine.syncAll();
      broadcast({
        type: 'mabos:sync_complete' as unknown as import('../types').SSEEventType,
        payload: report as unknown as Record<string, unknown>,
      } as unknown as import('../types').SSEEvent);
    } catch (err) {
      console.error('[MABOS] Periodic sync failed:', err);
    }
  }, SYNC_INTERVAL_MS);

  instance = {
    client,
    syncEngine,
    eventBridge,
    triggerSync: () => syncEngine.syncAll(),
    getBusinessId: () => businessId,
  };

  // Start auto-dispatch scheduler after initial sync
  const scheduler = getScheduler();
  if (!scheduler.getStatus().running) {
    console.log('[MABOS] Starting auto-dispatch scheduler...');
    scheduler.start();
  }

  console.log(`[MABOS] Integration initialized (businessId: ${businessId})`);
  return instance;
}

export function destroyMabosIntegration(): void {
  // Stop scheduler
  const scheduler = getScheduler();
  if (scheduler.getStatus().running) {
    scheduler.stop();
  }

  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (instance) {
    instance.eventBridge.stop();
    instance = null;
  }
}
