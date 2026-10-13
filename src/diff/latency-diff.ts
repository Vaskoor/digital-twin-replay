// src/diff/latency-diff.ts — latency budget comparison
// Compares prod vs staging response times and flags regressions.

export interface LatencyDiff {
  prodMs: number;
  stagingMs: number;
  deltaMs: number;
  deltaPct: number;
  regression: boolean;
  severity: "none" | "low" | "medium" | "high" | "critical";
}

/** Compare latencies against a budget threshold. */
export function diffLatency(prodMs: number, stagingMs: number, budgetMs = 800): LatencyDiff {
  const deltaMs = stagingMs - prodMs;
  const deltaPct = prodMs > 0 ? (deltaMs / prodMs) * 100 : 0;
  const regression = stagingMs > budgetMs || deltaPct > 50;

  let severity: LatencyDiff["severity"] = "none";
  if (deltaPct > 200 || stagingMs > budgetMs * 3) severity = "critical";
  else if (deltaPct > 100 || stagingMs > budgetMs * 2) severity = "high";
  else if (deltaPct > 50 || stagingMs > budgetMs) severity = "medium";
  else if (deltaPct > 20) severity = "low";

  return { prodMs, stagingMs, deltaMs, deltaPct, regression, severity };
}
