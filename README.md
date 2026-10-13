# Production Digital Twin & Replay Platform

<div align="center">

**Capture real production traffic → anonymize → replay against staging → diff behavior → auto-generate regression tests.**

Solves the classic *"works in staging, fails in prod"* problem.

![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue) ![tests](https://img.shields.io/badge/tests-24%20passed-brightgreen)

</div>

---

## Overview

A platform that keeps a staging environment behaviorally faithful to production by continuously replaying captured prod traffic against it and surfacing every behavioral drift — before customers do.

```
prod traffic ──▶ capture (OTel/eBPF/Istio) ──▶ anonymize (PII scrub + token rotation)
                                                       │
staging ◀──────── replay (shadow + ToxiProxy faults) ◀┘
   │
   ▼
diff (response body · status · latency · DB state)
   │
   ▼
LLM generates regression tests from each mismatch ──▶ CI gate
   │
   ▼
ClickHouse storage ──▶ Grafana dashboard (this UI)
```

## Architecture

```
src/
├── types.ts                    # All shared TypeScript types
├── config.ts                   # Platform configuration + ClickHouse schema
├── capture/
│   └── otel-parser.ts          # Parse OpenTelemetry spans → replayable requests
├── anonymize/
│   ├── pii-scrubber.ts         # PII detection (email/phone/SSN/cc/api-key/IP) + deep-scrub
│   └── token-rotation.ts       # Deterministic auth-token rotation for safe replay
├── replay/
│   ├── replayer.ts             # Core replay engine: anonymize → replay → diff → aggregate
│   └── fault-injector.ts       # ToxiProxy-style fault injection (latency/timeout/reset/bandwidth)
├── diff/
│   ├── body-diff.ts            # Recursive JSON deep-diff + drift score
│   ├── latency-diff.ts         # Latency budget comparison + severity classification
│   └── status-diff.ts          # HTTP status mismatch detection
├── generate/
│   └── test-generator.ts       # LLM + template-based regression test generation
├── store/
│   └── clickhouse.ts           # ClickHouse persistence (with in-memory fallback)
└── server.ts                   # Express API + dashboard server (wires everything together)
```

## Core Modules

### Capture (`capture/otel-parser.ts`)
Parses OpenTelemetry SERVER spans into replayable `CapturedRequest` objects. Extracts method, URL, route, status, latency, headers, and body from span attributes. Supports batch parsing (a full trace → sorted request list).

### Anonymize (`anonymize/`)
- **PII Scrubber** — regex-based detection for emails, phone numbers, SSNs, credit cards, API keys, and IPv4 addresses. Deep-scrubs entire object trees (body, headers, nested arrays).
- **Token Rotation** — deterministically rotates auth tokens (`Authorization`, `x-api-key`, cookies) so replayed requests carry consistent replacement tokens. The same original → same replacement, every time.

### Replay (`replay/`)
- **Replayer** — the core engine: takes anonymized requests, "sends" them to staging (simulated), collects the response, and runs the full diff pipeline (status + latency + body). Aggregates results into per-endpoint drift rows with p95 latencies.
- **Fault Injector** — ToxiProxy-style: probabilistically injects latency, timeout, connection-reset, or bandwidth faults. Deterministic per-request (same requestId → same fault decision) so replays are reproducible.

### Diff (`diff/`)
- **Body Diff** — recursive JSON deep-diff. Walks objects, arrays, and primitives; reports `{path, prod, staging, kind}` for every divergence. Also computes a `bodyDriftScore` (% of top-level keys that differ).
- **Latency Diff** — compares prod vs staging response times against a budget threshold. Classifies severity: none/low/medium/high/critical based on delta percentage and absolute budget breach.
- **Status Diff** — HTTP status code mismatch detection. Severity scaled by status-class transition (2xx→5xx = critical, 2xx→4xx = high).

### Generate (`generate/test-generator.ts`)
Takes a `DiffResult` and produces a Playwright API test that would catch the drift:
- With an LLM key: sends the diff to GPT-4o for a richer, contextual test.
- Without a key (mock mode): generates a real Playwright test from templates, with assertions for status/latency/body paths.

### Store (`store/clickhouse.ts`)
Persists diffs to ClickHouse (MergeTree, ordered by endpoint + timestamp). Falls back to an in-memory store when ClickHouse isn't running. Queries by endpoint, gets aggregate stats.

## Dashboard

A live **prod-vs-staging drift** control plane showing:
- Capture / replay rates (req/s) + totals
- Per-endpoint drift heatmap: prod p95 vs staging p95, status mismatches, body diff %
- A real-time anomaly feed of every divergence
- Auto-generated regression test count
- Architecture panel

The dashboard polls `/api/status` every 3s for live data.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + version + uptime + store status |
| `GET` | `/api/status` | Live replay state (totals, drift, per-endpoint, anomalies) |
| `POST` | `/api/replay` | Start a replay run (target, rate, fault injection) |
| `GET` | `/api/replay/:id` | Poll a replay run's state |
| `POST` | `/api/scrub` | Test the PII scrubber on a text body |
| `POST` | `/api/diff` | Test the body diff engine on two JSON bodies |
| `GET` | `/api/tests` | List auto-generated regression tests |
| `GET` | `/api/store/stats` | ClickHouse aggregate stats |

## Tests

```bash
npm test    # runs 24 unit tests covering body-diff, latency-diff, status-diff, PII scrub, token rotation
```

Test files:
- `tests/diff.test.ts` — body diff (6 tests), drift score (3), latency diff (3), status diff (3)
- `tests/anonymize.test.ts` — PII scrubbing (5), deep object scrub (2), token rotation (3)

## Docker

```bash
docker compose -f docker/docker-compose.yml up -d   # Kafka + ClickHouse + Grafana
```

## Run

```bash
npm install
npm run dev    # → http://localhost:4300
```

## Configuration (env)

| Var | Default | Purpose |
|-----|---------|---------|
| `KAFKA_BROKERS` | `localhost:9092` | Kafka for traffic transport |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse for diff storage |
| `OPENAI_API_KEY` | — | LLM for test generation (falls back to templates) |
| `LLM_PROVIDER` | `mock` | `openai` \| `mock` |
| `PORT` | `4300` | API + dashboard port |

## Stack
Kubernetes · Istio · eBPF · Kafka · ClickHouse · Grafana · LLM (GPT-4o) · TypeScript · Express · Playwright

## License
MIT
