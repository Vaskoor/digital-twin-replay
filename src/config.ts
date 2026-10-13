// src/config.ts — platform configuration
import type { ReplayConfig } from "./types.js";

export const PLATFORM_CONFIG = {
  version: "1.0.0",
  defaultPort: 4300,
  kafkaBrokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  clickhouseUrl: process.env.CLICKHOUSE_URL || "http://localhost:8123",
  grafanaUrl: process.env.GRAFANA_URL || "http://localhost:3000",
  llmApiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
  llmProvider: process.env.LLM_PROVIDER || "mock",
  captureBackends: ["opentelemetry", "ebpf", "istio"],
  replayBatchSize: 500,
  diffTimeoutMs: 5000,
  testGenModel: "gpt-4o",
};

export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  target: "https://staging.example.com",
  replayRate: 100,
  faultInjection: null,
  anonymize: true,
  diffDbState: true,
  generateTests: true,
  llmProvider: PLATFORM_CONFIG.llmProvider,
};

export const CLICKHOUSE_SCHEMA = `
CREATE TABLE IF NOT EXISTS replay_diffs (
  request_id String,
  endpoint String,
  diff_kind Enum('status','body','latency','header','db-state'),
  severity Enum('none','low','medium','high','critical'),
  prod_status UInt16,
  staging_status UInt16,
  prod_latency_ms UInt32,
  staging_latency_ms UInt32,
  detail String,
  timestamp DateTime64(3)
) ENGINE = MergeTree() ORDER BY (endpoint, timestamp);
`;
