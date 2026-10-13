// src/replay/replayer.ts — core replay engine
// Takes anonymized captured requests, replays them against staging, collects
// responses, and runs the diff engine. Models the full capture→replay→diff loop.

import type { AnonymizedRequest, DiffResult, EndpointDrift, ReplayConfig } from "../types.js";
import { diffBodies, bodyDriftScore } from "../diff/body-diff.js";
import { diffLatency } from "../diff/latency-diff.js";
import { diffStatus } from "../diff/status-diff.js";
import { scrubObject } from "../anonymize/pii-scrubber.js";
import { rotateTokens } from "../anonymize/token-rotation.js";

/** Replay a single request against a staging URL + produce a diff. */
export async function replayRequest(
  req: AnonymizedRequest,
  stagingUrl: string,
  config: ReplayConfig,
): Promise<DiffResult> {
  // In production, this fetches stagingUrl. Here we simulate the staging response
  // with a realistic model (occasional drift).
  const drift = Math.random() < 0.22; // 22% of requests drift
  const stagingStatus = drift && Math.random() < 0.3 ? 503 : req.responseStatus;
  const stagingLatency = req.durationMs * (drift ? 1 + Math.random() * 1.2 : 1 + Math.random() * 0.15);
  const stagingBody = drift ? injectDrift(req.responseBody) : req.responseBody;

  const sDiff = diffStatus(req.responseStatus, stagingStatus);
  const lDiff = diffLatency(req.durationMs, stagingLatency);
  const bDiff = diffBodies(req.responseBody, stagingBody);
  const bScore = bodyDriftScore(req.responseBody, stagingBody);

  const maxSev = [sDiff.severity, lDiff.severity, bScore > 50 ? "high" : bScore > 10 ? "medium" : "none"]
    .sort((a, b) => sevRank(b) - sevRank(a))[0];

  return {
    requestId: req.id,
    endpoint: req.path,
    kind: sDiff.match ? (lDiff.regression ? "latency" : bScore > 0 ? "body" : "none") : "status",
    severity: maxSev as DiffResult["severity"],
    detail: sDiff.match
      ? `${bDiff.length} body diff(s), latency Δ${lDiff.deltaMs.toFixed(0)}ms (${lDiff.deltaPct.toFixed(0)}%)`
      : `status mismatch: prod ${sDiff.prod} vs staging ${sDiff.staging}`,
    prodValue: JSON.stringify(req.responseStatus),
    stagingValue: JSON.stringify(stagingStatus),
    prodStatus: req.responseStatus,
    stagingStatus,
    prodLatencyMs: Math.round(req.durationMs),
    stagingLatencyMs: Math.round(stagingLatency),
    bodyDiffs: bDiff,
    timestamp: Date.now(),
  };
}

/** Anonymize a captured request (scrub PII + rotate tokens). */
export function anonymizeRequest(req: CapturedRequestLike): AnonymizedRequest {
  const { _piiFields, ...scrubbedBody } = scrubObject(req.body);
  const { headers, rotations } = rotateTokens(req.headers);
  return {
    ...req,
    headers,
    body: scrubbedBody,
    anonymized: true,
    piiFields: _piiFields || [],
    tokenRotations: rotations,
  };
}

/** Aggregate diffs into per-endpoint drift rows. */
export function aggregateDrift(diffs: DiffResult[], endpoints: string[]): EndpointDrift[] {
  return endpoints.map((ep) => {
    const epDiffs = diffs.filter((d) => d.endpoint === ep);
    const statusDrift = epDiffs.filter((d) => d.kind === "status").length;
    const bodyDiffs = epDiffs.filter((d) => d.bodyDiffs.length > 0);
    const bodyDrift = bodyDiffs.length > 0
      ? Math.round(bodyDiffs.reduce((s, d) => s + d.bodyDiffs.length, 0) / bodyDiffs.length * 10) || 0
      : 0;
    const latencies = epDiffs.map((d) => ({ prod: d.prodLatencyMs, stage: d.stagingLatencyMs }));
    const prodP95 = percentile(latencies.map((l) => l.prod), 95);
    const stageP95 = percentile(latencies.map((l) => l.stage), 95);
    return { endpoint: ep, prodP95, stageP95, statusDrift, bodyDrift, reqs: epDiffs.length };
  });
}

// --- helpers ---

type CapturedRequestLike = Omit<AnonymizedRequest, "anonymized" | "piiFields" | "tokenRotations">;

function injectDrift(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const out = { ...(body as Record<string, unknown>) };
  const keys = Object.keys(out);
  if (keys.length === 0) return out;
  const k = keys[Math.floor(Math.random() * keys.length)];
  out[k] = `drift-${Math.random().toString(36).slice(2, 8)}`;
  return out;
}

function sevRank(s: string): number {
  return ({ none: 0, low: 1, medium: 2, high: 3, critical: 4 } as Record<string, number>)[s] ?? 0;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.max(0, sorted[Math.max(0, idx)] || 0);
}
