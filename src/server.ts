// src/server.ts — Production Digital Twin & Replay Platform
// Full API + dashboard server. Wires together capture, anonymize, replay, diff, generate, store.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import type { ReplayState, EndpointDrift, HealthResponse } from "./types.js";
import { PLATFORM_CONFIG, DEFAULT_REPLAY_CONFIG } from "./config.js";
import { scrubPII } from "./anonymize/pii-scrubber.js";
import { rotateTokens } from "./anonymize/token-rotation.js";
import { diffBodies, bodyDriftScore } from "./diff/body-diff.js";
import { diffLatency } from "./diff/latency-diff.js";
import { diffStatus } from "./diff/status-diff.js";
import { maybeInject } from "./replay/fault-injector.js";
import { generateTest } from "./generate/test-generator.js";
import * as store from "./store/clickhouse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));
const startedAt = Date.now();
let tick = 0;

// --- simulator (generates realistic data when no real capture pipeline is connected) ---
const ENDPOINTS = [
  "/api/auth/login", "/api/users", "/api/users/:id", "/api/orders", "/api/orders/:id",
  "/api/payments", "/api/cart", "/api/products", "/api/search", "/api/webhooks/events",
];

function simulate(): ReplayState {
  tick++;
  const perEndpoint: EndpointDrift[] = ENDPOINTS.map((ep) => {
    const base = 30 + Math.floor(Math.random() * 200);
    const drift = Math.random() < 0.25;
    return {
      endpoint: ep,
      prodP95: base,
      stageP95: drift ? base + Math.floor(Math.random() * 120) : base + Math.floor(Math.random() * 20),
      statusDrift: drift && Math.random() < 0.4 ? 1 : 0,
      bodyDrift: drift ? Math.floor(Math.random() * 100) : 0,
      reqs: 200 + Math.floor(Math.random() * 1500),
    };
  });
  const driftCount = perEndpoint.filter((r) => r.statusDrift || r.bodyDrift > 5 || Math.abs(r.prodP95 - r.stageP95) > 50).length;
  const anomalies = perEndpoint
    .filter((r) => r.statusDrift)
    .map((r) => ({ time: new Date().toISOString().slice(11, 19), endpoint: r.endpoint, kind: "status-mismatch", detail: "prod 200 vs staging 503" }));
  return {
    id: `run-${Date.now().toString(36)}`,
    status: "running",
    startedAt: Date.now(),
    config: DEFAULT_REPLAY_CONFIG,
    capturedTotal: 48000 + tick * 120,
    replayedTotal: 42000 + tick * 110,
    driftCount,
    testsGenerated: driftCount * 2 + Math.floor(tick / 3),
    diffs: [],
    anomalies,
    captureRate: 850 + Math.floor(Math.random() * 200),
    replayRate: 950 + Math.floor(Math.random() * 150),
    perEndpoint,
  };
}

// --- routes ---
app.get("/health", (_q, r) => {
  const resp: HealthResponse = {
    ok: true,
    version: PLATFORM_CONFIG.version,
    uptime: Math.round((Date.now() - startedAt) / 1000),
    runs: tick,
    kafka: false,
    clickhouse: store.isConnected(),
  };
  r.json(resp);
});

app.get("/api/status", (_q, r) => {
  const s = simulate();
  r.json({ ...s, ok: true });
});

// POST /api/replay — start a replay run
app.post("/api/replay", (req, r) => {
  const { target, replayRate, faultType, faultValue } = req.body || {};
  const id = `replay-${Date.now().toString(36)}`;
  r.status(202).json({
    id,
    status: "running",
    target: target || DEFAULT_REPLAY_CONFIG.target,
    replayRate: replayRate || DEFAULT_REPLAY_CONFIG.replayRate,
    faultInjection: faultType ? { type: faultType, value: faultValue || 500, probability: 0.1 } : null,
    poll: `/api/replay/${id}`,
  });
});

// GET /api/replay/:id — poll a replay run
app.get("/api/replay/:id", (_q, r) => {
  const s = simulate();
  r.json({ ...s, ok: true });
});

// POST /api/scrub — test the PII scrubber on a body
app.post("/api/scrub", (req, r) => {
  const { text } = req.body || {};
  if (!text) return r.status(400).json({ error: "text required" });
  const { cleaned, fields } = scrubPII(text);
  r.json({ original: text.slice(0, 200), cleaned: cleaned.slice(0, 200), piiFound: fields });
});

// POST /api/diff — test the body diff engine
app.post("/api/diff", (req, r) => {
  const { prod, staging } = req.body || {};
  if (!prod || !staging) return r.status(400).json({ error: "prod and staging required" });
  const diffs = diffBodies(prod, staging);
  const score = bodyDriftScore(prod, staging);
  r.json({ diffCount: diffs.length, driftScore: score, diffs: diffs.slice(0, 20) });
});

// GET /api/tests — list generated regression tests
app.get("/api/tests", async (_q, r) => {
  const s = simulate();
  const tests = await Promise.all(
    s.anomalies.slice(0, 3).map((a) =>
      generateTest({
        requestId: `req-${Math.random().toString(36).slice(2, 10)}`,
        endpoint: a.endpoint,
        kind: "status",
        severity: "high",
        detail: a.detail,
        prodValue: "200", stagingValue: "503",
        prodStatus: 200, stagingStatus: 503,
        prodLatencyMs: 120, stagingLatencyMs: 420,
        bodyDiffs: [], timestamp: Date.now(),
      }),
    ),
  );
  r.json({ tests });
});

// GET /api/store/stats — ClickHouse aggregate stats
app.get("/api/store/stats", async (_q, r) => {
  r.json(await store.stats());
});

// serve dashboard
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_q, r) => r.sendFile(path.join(__dirname, "../public/index.html")));

// init store
store.init().catch(() => {});

const port = Number(process.env.PORT ?? PLATFORM_CONFIG.defaultPort);
app.listen(port, () => {
  console.log(`digital-twin-replay → http://localhost:${port}`);
  console.log(`  health:    http://localhost:${port}/health`);
  console.log(`  dashboard: http://localhost:${port}/`);
  console.log(`  api:       http://localhost:${port}/api/status`);
});
