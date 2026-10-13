// src/diff/body-diff.ts — deep JSON body diff
// Recursively compares two response bodies and produces a list of diffs.

import type { DiffPath } from "../types.js";

/** Deep-diff two JSON values, returning the paths that differ. */
export function diffBodies(prod: unknown, staging: unknown, basePath = ""): DiffPath[] {
  const diffs: DiffPath[] = [];

  if (prod === staging) return diffs; // identical (handles primitives + null)
  if (prod === null || staging === null) {
    diffs.push({ path: basePath || "$", prod, staging, kind: "changed" });
    return diffs;
  }
  if (typeof prod !== typeof staging) {
    diffs.push({ path: basePath || "$", prod, staging, kind: "changed" });
    return diffs;
  }

  if (typeof prod === "object" && typeof staging === "object") {
    if (Array.isArray(prod) !== Array.isArray(staging)) {
      diffs.push({ path: basePath || "$", prod, staging, kind: "changed" });
      return diffs;
    }

    if (Array.isArray(prod) && Array.isArray(staging)) {
      const max = Math.max(prod.length, staging.length);
      for (let i = 0; i < max; i++) {
        const p = `${basePath}[${i}]`;
        if (i >= prod.length) diffs.push({ path: p, prod: undefined, staging: staging[i], kind: "added" });
        else if (i >= staging.length) diffs.push({ path: p, prod: prod[i], staging: undefined, kind: "removed" });
        else diffs.push(...diffBodies(prod[i], staging[i], p));
      }
      return diffs;
    }

    const prodObj = prod as Record<string, unknown>;
    const stageObj = staging as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(prodObj), ...Object.keys(stageObj)]);
    for (const key of allKeys) {
      const p = basePath ? `${basePath}.${key}` : key;
      if (!(key in prodObj)) diffs.push({ path: p, prod: undefined, staging: stageObj[key], kind: "added" });
      else if (!(key in stageObj)) diffs.push({ path: p, prod: prodObj[key], staging: undefined, kind: "removed" });
      else diffs.push(...diffBodies(prodObj[key], stageObj[key], p));
    }
    return diffs;
  }

  // primitive mismatch
  diffs.push({ path: basePath || "$", prod, staging, kind: "changed" });
  return diffs;
}

/** Compute a body-drift score (0-100) — % of top-level keys that differ. */
export function bodyDriftScore(prod: unknown, staging: unknown): number {
  if (typeof prod !== "object" || typeof staging !== "object") {
    return prod === staging ? 0 : 100;
  }
  const pk = Object.keys(prod as object);
  const sk = Object.keys(staging as object);
  if (pk.length === 0 && sk.length === 0) return 0;
  const all = new Set([...pk, ...sk]);
  let diff = 0;
  for (const k of all) {
    if (diffBodies((prod as any)[k], (staging as any)[k], k).length > 0) diff++;
  }
  return Math.round((diff / all.size) * 100);
}
