// src/store/clickhouse.ts — ClickHouse persistence for replay diffs
// Models the ClickHouse client. Falls back to in-memory when ClickHouse is unavailable.

import type { DiffResult } from "../types.js";
import { PLATFORM_CONFIG, CLICKHOUSE_SCHEMA } from "../config.js";

const memoryStore: DiffResult[] = [];
let connected = false;

/** Initialize the ClickHouse connection (or fall back to memory). */
export async function init(): Promise<boolean> {
  try {
    const res = await fetch(`${PLATFORM_CONFIG.clickhouseUrl}/ping`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      // Create the schema
      await fetch(`${PLATFORM_CONFIG.clickhouseUrl}/?query=${encodeURIComponent(CLICKHOUSE_SCHEMA)}`, {
        method: "POST",
      });
      connected = true;
      return true;
    }
  } catch {
    // ClickHouse not running — fall back to memory store
  }
  connected = false;
  return false;
}

/** Store a batch of diffs. */
export async function storeDiffs(diffs: DiffResult[]): Promise<void> {
  if (connected) {
    // In production, this would batch-insert into ClickHouse via the HTTP interface
    // const values = diffs.map(d => `('${d.requestId}','${d.endpoint}','${d.kind}','${d.severity}',${d.prodStatus},${d.stagingStatus},${d.prodLatencyMs},${d.stagingLatencyMs},'${d.detail}',now())`).join(',');
    // await fetch(`${PLATFORM_CONFIG.clickhouseUrl}/?query=INSERT INTO replay_diffs VALUES ${values}`, { method: "POST" });
  }
  memoryStore.push(...diffs);
  if (memoryStore.length > 10000) memoryStore.splice(0, memoryStore.length - 10000);
}

/** Query recent diffs by endpoint. */
export async function queryDiffs(endpoint?: string, limit = 100): Promise<DiffResult[]> {
  if (endpoint) return memoryStore.filter((d) => d.endpoint === endpoint).slice(-limit);
  return memoryStore.slice(-limit);
}

/** Get aggregate drift stats. */
export async function stats(): Promise<{ totalDiffs: number; bySeverity: Record<string, number> }> {
  const bySeverity: Record<string, number> = {};
  for (const d of memoryStore) bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
  return { totalDiffs: memoryStore.length, bySeverity };
}

export function isConnected(): boolean { return connected; }
