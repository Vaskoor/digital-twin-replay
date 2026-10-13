// src/replay/fault-injector.ts — ToxiProxy-style fault injection for replay
// Models latency, timeout, connection-reset, and bandwidth faults.

import type { FaultConfig } from "../types.js";

export interface InjectedFault {
  type: FaultConfig["type"];
  applied: boolean;
  addedDelayMs: number;
  detail: string;
}

/** Decide whether to inject a fault for a given request (probabilistic). */
export function maybeInject(config: FaultConfig, requestId: string): InjectedFault {
  // Deterministic pseudo-random from request id so the same request always gets the same fault
  const seed = hashStr(requestId);
  const roll = (seed % 1000) / 1000;
  if (roll > config.probability) {
    return { type: config.type, applied: false, addedDelayMs: 0, detail: "no fault injected" };
  }

  switch (config.type) {
    case "latency":
      return { type: "latency", applied: true, addedDelayMs: config.value, detail: `+${config.value}ms latency` };
    case "timeout":
      return { type: "timeout", applied: true, addedDelayMs: config.value, detail: `timeout after ${config.value}ms` };
    case "connection-reset":
      return { type: "connection-reset", applied: true, addedDelayMs: 0, detail: "connection reset" };
    case "bandwidth":
      return { type: "bandwidth", applied: true, addedDelayMs: Math.round(config.value / 100), detail: `bandwidth limited to ${config.value}kbps` };
    default:
      return { type: config.type, applied: false, addedDelayMs: 0, detail: "unknown fault type" };
  }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
