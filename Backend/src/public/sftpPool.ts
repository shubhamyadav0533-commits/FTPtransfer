import SftpClient from "ssh2-sftp-client";
import type { DecryptedSftpCredentials } from "./publicTypes";

interface PoolEntry {
  client: SftpClient;
  lastUsed: number;
  inUse: boolean;
}

const MAX_POOL_SIZE = 20;
const IDLE_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Simple SFTP connection pool keyed by tenant ID.
 * Reuses connections for the same tenant, auto-disconnects idle ones.
 */
class SftpConnectionPool {
  private pool: Map<string, PoolEntry[]> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Periodically clean up idle connections
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdle();
    }, 30_000);
  }

  /**
   * Acquires an SFTP connection for the given tenant.
   * Reuses an idle connection if available, otherwise creates a new one.
   */
  async acquire(
    tenantId: string,
    credentials: DecryptedSftpCredentials
  ): Promise<SftpClient> {
    const entries = this.pool.get(tenantId) ?? [];

    // Try to find an idle connection
    for (const entry of entries) {
      if (!entry.inUse) {
        // Test if connection is still alive
        try {
          await entry.client.cwd();
          entry.inUse = true;
          entry.lastUsed = Date.now();
          return entry.client;
        } catch {
          // Connection is dead — remove it
          await this.destroyEntry(entry);
          const idx = entries.indexOf(entry);
          if (idx !== -1) entries.splice(idx, 1);
        }
      }
    }

    // No idle connection — create a new one if under limit
    const totalConnections = this.getTotalCount();
    if (totalConnections >= MAX_POOL_SIZE) {
      // Force-evict the oldest idle connection across all tenants
      this.evictOldest();
    }

    const client = new SftpClient();

    await client.connect({
      host: credentials.host,
      port: credentials.port,
      username: credentials.username,
      password: credentials.password,
      tryKeyboard: true,
      retries: 2,
      retry_minTimeout: 2000,
    });

    const entry: PoolEntry = {
      client,
      lastUsed: Date.now(),
      inUse: true,
    };

    entries.push(entry);
    this.pool.set(tenantId, entries);

    return client;
  }

  /**
   * Releases a connection back to the pool.
   */
  release(tenantId: string, client: SftpClient): void {
    const entries = this.pool.get(tenantId);
    if (!entries) return;

    const entry = entries.find((e) => e.client === client);
    if (entry) {
      entry.inUse = false;
      entry.lastUsed = Date.now();
    }
  }

  /**
   * Creates a standalone (non-pooled) connection.
   * Used for one-off operations like registration validation.
   */
  async createStandalone(
    credentials: DecryptedSftpCredentials
  ): Promise<SftpClient> {
    const client = new SftpClient();

    await client.connect({
      host: credentials.host,
      port: credentials.port,
      username: credentials.username,
      password: credentials.password,
      tryKeyboard: true,
      retries: 2,
      retry_minTimeout: 2000,
    });

    return client;
  }

  private getTotalCount(): number {
    let count = 0;
    for (const entries of this.pool.values()) {
      count += entries.length;
    }
    return count;
  }

  private evictOldest(): void {
    let oldestTime = Infinity;
    let oldestTenantId: string | null = null;
    let oldestIdx = -1;

    for (const [tenantId, entries] of this.pool) {
      for (let i = 0; i < entries.length; i++) {
        if (!entries[i].inUse && entries[i].lastUsed < oldestTime) {
          oldestTime = entries[i].lastUsed;
          oldestTenantId = tenantId;
          oldestIdx = i;
        }
      }
    }

    if (oldestTenantId !== null && oldestIdx !== -1) {
      const entries = this.pool.get(oldestTenantId)!;
      const entry = entries[oldestIdx];
      this.destroyEntry(entry).catch(() => {});
      entries.splice(oldestIdx, 1);
      if (entries.length === 0) this.pool.delete(oldestTenantId);
    }
  }

  private cleanupIdle(): void {
    const now = Date.now();

    for (const [tenantId, entries] of this.pool) {
      const toRemove: number[] = [];

      for (let i = 0; i < entries.length; i++) {
        if (!entries[i].inUse && now - entries[i].lastUsed > IDLE_TIMEOUT_MS) {
          toRemove.push(i);
        }
      }

      // Remove in reverse order to preserve indices
      for (let i = toRemove.length - 1; i >= 0; i--) {
        const entry = entries[toRemove[i]];
        this.destroyEntry(entry).catch(() => {});
        entries.splice(toRemove[i], 1);
      }

      if (entries.length === 0) this.pool.delete(tenantId);
    }
  }

  private async destroyEntry(entry: PoolEntry): Promise<void> {
    try {
      await entry.client.end();
    } catch {
      // Already disconnected — ignore
    }
  }

  /**
   * Shuts down the pool and disconnects all connections.
   */
  async shutdown(): Promise<void> {
    clearInterval(this.cleanupInterval);

    for (const entries of this.pool.values()) {
      for (const entry of entries) {
        await this.destroyEntry(entry);
      }
    }
    this.pool.clear();
  }
}

/** Singleton SFTP connection pool */
export const sftpPool = new SftpConnectionPool();
