// src/diff/status-diff.ts — HTTP status mismatch detection

export interface StatusDiff {
  prod: number;
  staging: number;
  match: boolean;
  severity: "none" | "low" | "medium" | "high" | "critical";
}

/** Compare HTTP status codes, classify the drift severity. */
export function diffStatus(prod: number, staging: number): StatusDiff {
  if (prod === staging) return { prod, staging, match: true, severity: "none" };
  const prodClass = Math.floor(prod / 100);
  const stagingClass = Math.floor(staging / 100);
  let severity: StatusDiff["severity"] = "low";
  if (prodClass === 2 && stagingClass === 5) severity = "critical";
  else if (prodClass === 2 && stagingClass === 4) severity = "high";
  else if (prodClass !== stagingClass) severity = "medium";
  else if (prod !== staging) severity = "low";
  return { prod, staging, match: false, severity };
}
