// src/server.ts — Production Digital Twin & Replay Platform (simulator + API + dashboard)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// --- simulator state ---
const endpoints = [
  "/api/auth/login", "/api/users", "/api/users/:id", "/api/orders", "/api/orders/:id",
  "/api/payments", "/api/cart", "/api/products", "/api/search", "/api/webhooks/events",
];
const startedAt = Date.now();
let tick = 0;

interface DriftRow { endpoint: string; prodP95: number; stageP95: number; statusDrift: number; bodyDrift: number; reqs: number; }
interface ReplayState {
  capturedTotal: number; replayedTotal: number; driftCount: number; testsGenerated: number;
  rows: DriftRow[]; anomalies: { time: string; endpoint: string; kind: string; detail: string }[];
}

function simulate(): ReplayState {
  tick++;
  const rows: DriftRow[] = endpoints.map((ep) => {
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
  const driftCount = rows.filter((r) => r.statusDrift || r.bodyDrift > 5 || Math.abs(r.prodP95 - r.stageP95) > 50).length;
  const anomalies = rows
    .filter((r) => r.statusDrift)
    .map((r) => ({ time: new Date().toISOString().slice(11, 19), endpoint: r.endpoint, kind: "status-mismatch", detail: `prod 200 vs staging 503` }));
  return {
    capturedTotal: 48000 + tick * 120,
    replayedTotal: 42000 + tick * 110,
    driftCount,
    testsGenerated: driftCount * 2 + Math.floor(tick / 3),
    rows,
    anomalies,
  };
}

app.get("/api/status", (_req, res) => {
  const s = simulate();
  res.json({
    ok: true,
    uptime: Math.round((Date.now() - startedAt) / 1000),
    capturedTotal: s.capturedTotal,
    replayedTotal: s.replayedTotal,
    driftCount: s.driftCount,
    testsGenerated: s.testsGenerated,
    rows: s.rows,
    anomalies: s.anomalies,
    replayRate: 850 + Math.floor(Math.random() * 200),
    captureRate: 950 + Math.floor(Math.random() * 150),
  });
});

app.get("/health", (_req, res) => res.json({ ok: true, version: "0.1.0" }));
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "../public/index.html")));

const port = Number(process.env.PORT ?? 4300);
app.listen(port, () => console.log(`digital-twin-replay → http://localhost:${port}`));
