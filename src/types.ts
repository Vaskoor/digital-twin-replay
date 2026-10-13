// src/types.ts — shared types for the Production Digital Twin & Replay Platform

/** A captured production request ready for replay. */
export interface CapturedRequest {
  id: string;
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: number;
  traceId: string;
  spanId: string;
  durationMs: number;
  responseStatus: number;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
}

/** Anonymized request — PII scrubbed, tokens rotated. */
export interface AnonymizedRequest extends CapturedRequest {
  anonymized: true;
  piiFields: string[];
  tokenRotations: { field: string; original: string; replacement: string }[];
}

/** A single diff between prod and staging responses. */
export interface DiffResult {
  requestId: string;
  endpoint: string;
  kind: "status" | "body" | "latency" | "header" | "db-state";
  severity: "none" | "low" | "medium" | "high" | "critical";
  detail: string;
  prodValue: string;
  stagingValue: string;
  prodStatus: number;
  stagingStatus: number;
  prodLatencyMs: number;
  stagingLatencyMs: number;
  bodyDiffs: DiffPath[];
  timestamp: number;
}

export interface DiffPath {
  path: string;
  prod: unknown;
  staging: unknown;
  kind: "added" | "removed" | "changed";
}

/** A replay run configuration. */
export interface ReplayConfig {
  target: string;
  replayRate: number;        // req/s
  faultInjection: FaultConfig | null;
  anonymize: boolean;
  diffDbState: boolean;
  generateTests: boolean;
  llmProvider: string;
}

export interface FaultConfig {
  type: "latency" | "timeout" | "connection-reset" | "bandwidth";
  value: number;
  probability: number;
}

/** A replay run's live state. */
export interface ReplayState {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: number;
  config: ReplayConfig;
  capturedTotal: number;
  replayedTotal: number;
  driftCount: number;
  testsGenerated: number;
  diffs: DiffResult[];
  anomalies: { time: string; endpoint: string; kind: string; detail: string }[];
  captureRate: number;
  replayRate: number;
  perEndpoint: EndpointDrift[];
}

export interface EndpointDrift {
  endpoint: string;
  prodP95: number;
  stageP95: number;
  statusDrift: number;
  bodyDrift: number;
  reqs: number;
}

/** A generated regression test. */
export interface GeneratedTest {
  id: string;
  endpoint: string;
  framework: "playwright" | "k6" | "jest";
  title: string;
  code: string;
  fromDiff: string; // requestId of the diff that triggered generation
}

/** Health/Status response. */
export interface HealthResponse {
  ok: boolean;
  version: string;
  uptime: number;
  runs: number;
  kafka: boolean;
  clickhouse: boolean;
}
