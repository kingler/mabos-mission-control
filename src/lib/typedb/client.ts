/**
 * TypeDB HTTP Client — Thin singleton for Mission Control
 *
 * Read-focused wrapper around typedb-driver-http with graceful degradation.
 * When TypeDB is unavailable, throws TypeDBUnavailableError so callers
 * can fall back to SQLite.
 *
 * Modeled on OpenClaw's typedb-client.ts but much slimmer.
 */

import type {
  TypeDBHttpDriver as TypeDBHttpDriverType,
  DriverParams,
  ApiResponse,
  QueryResponse,
  DatabasesListResponse,
  Database,
} from 'typedb-driver-http';

// ── Error Types ─────────────────────────────────────────────────────────

export class TypeDBUnavailableError extends Error {
  constructor(message = 'TypeDB is not available') {
    super(message);
    this.name = 'TypeDBUnavailableError';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function unwrap<T>(res: ApiResponse<T>): T {
  if ('err' in res) {
    throw new Error(`TypeDB API error [${(res as { err: { code: string; message: string } }).err.code}]: ${(res as { err: { code: string; message: string } }).err.message}`);
  }
  return (res as { ok: T }).ok;
}

// ── Client ──────────────────────────────────────────────────────────────

export class MCTypeDBClient {
  private driver: TypeDBHttpDriverType | null = null;
  private available = false;
  private driverParams: DriverParams;
  private database: string;

  constructor() {
    const serverUrl = process.env.TYPEDB_HTTP_URL || 'http://localhost:8000';
    this.database = process.env.TYPEDB_DATABASE || 'mabos';
    this.driverParams = {
      username: 'admin',
      password: 'password',
      addresses: [serverUrl],
    };
  }

  /** Attempt to connect. Sets availability flag silently. */
  async connect(): Promise<boolean> {
    try {
      const { TypeDBHttpDriver } = await import('typedb-driver-http');
      this.driver = new TypeDBHttpDriver(this.driverParams);
      const res = await this.driver.getDatabases();
      unwrap(res);
      this.available = true;
      return true;
    } catch {
      this.driver = null;
      this.available = false;
      return false;
    }
  }

  isAvailable(): boolean {
    return this.available && this.driver !== null;
  }

  private ensureAvailable(): void {
    if (!this.isAvailable()) {
      throw new TypeDBUnavailableError();
    }
  }

  /** Run a match (read) query. Returns parsed QueryResponse. */
  async matchQuery(typeql: string): Promise<QueryResponse | null> {
    this.ensureAvailable();
    const res = await this.driver!.oneShotQuery(typeql, false, this.database, 'read');
    return unwrap(res) as QueryResponse;
  }

  /** Insert data (write query). */
  async insertData(typeql: string): Promise<QueryResponse | null> {
    this.ensureAvailable();
    const res = await this.driver!.oneShotQuery(typeql, true, this.database, 'write');
    return unwrap(res) as QueryResponse;
  }

  /** Health check: returns availability + counts. */
  async healthCheck(): Promise<{
    available: boolean;
    database: string;
    databases: string[];
  }> {
    try {
      if (!this.driver) {
        await this.connect();
      }
      if (!this.isAvailable()) {
        return { available: false, database: this.database, databases: [] };
      }
      const res = await this.driver!.getDatabases();
      const { databases } = unwrap(res) as DatabasesListResponse;
      return {
        available: true,
        database: this.database,
        databases: databases.map((db: Database) => db.name),
      };
    } catch {
      this.available = false;
      return { available: false, database: this.database, databases: [] };
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────────

let instance: MCTypeDBClient | null = null;

/**
 * Lazy singleton TypeDB client.
 * First call triggers fire-and-forget connection attempt.
 */
export function getTypeDBClient(): MCTypeDBClient {
  if (!instance) {
    instance = new MCTypeDBClient();
    instance.connect().catch(() => {});
  }
  return instance;
}
