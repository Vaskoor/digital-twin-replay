# Production Digital Twin & Replay Platform

<div align="center">

**Capture real production traffic → anonymize → replay against staging → diff behavior → auto-generate regression tests.**

Solves the classic *"works in staging, fails in prod"* problem.

![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## What it does

A platform that keeps a staging environment behaviorally faithful to production by continuously replaying captured prod traffic against it and surfacing every behavioral drift — before customers do.

```
prod traffic ──▶ capture (OTel/eBPF/Istio) ──▶ anonymize ──▶ Kafka
                                                       │
staging ◀──────── replay (shadow + ToxiProxy) ◀───────┘
   │
   ▼
diff (response · status · latency · DB state · side-effects)
   │
   ▼
LLM generates regression tests from each mismatch ──▶ CI gate
```

## Dashboard

A live **prod-vs-staging drift** control plane showing:
- Capture / replay rates (req/s) + totals
- Per-endpoint drift heatmap: prod p95 vs staging p95, status mismatches, body diff %
- A real-time anomaly feed of every divergence
- Auto-generated regression test count

## Architecture (production stack)

| Layer | Technology |
|-------|-----------|
| Capture | OpenTelemetry SDK, eBPF (Pixie), Istio access logs |
| Transport | Kafka (partitioned by request-id, retention 24h) |
| Anonymization | PII scrub + token rotation + schema-aware redaction |
| Replay | Traffic shadowing + ToxiProxy (fault injection) |
| Diff engine | JSON body diff + status + latency + DB row hash |
| Storage | ClickHouse (per-request diff records) |
| Visualization | Grafana dashboard (this UI) |
| Test generation | LLM turns each mismatch into a Playwright/k6 regression test |

## Run locally

```bash
npm install
npm run dev    # → http://localhost:4300
```

The dashboard polls `/api/status` every 3s for live (simulated) drift metrics.

## API

- `GET /health` — liveness
- `GET /api/status` — capture/replay totals, per-endpoint drift, anomaly feed

## Why it's OG

Platform teams adopt tools that catch staging/prod drift *before* deploy. This is the missing piece between observability and CI — it makes staging a real digital twin of prod.

## License
MIT
