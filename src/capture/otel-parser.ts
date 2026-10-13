// src/capture/otel-parser.ts — parse OpenTelemetry spans into captured requests
// Models the transformation from distributed-trace spans to replayable requests.

import type { CapturedRequest } from "../types.js";

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string; // SERVER, CLIENT, INTERNAL
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Record<string, string | number | boolean>;
  status: { code: string; message?: string };
  resource?: { attributes: Record<string, string> };
}

/** Convert an OTel SERVER span to a CapturedRequest. */
export function spanToRequest(span: OtelSpan): CapturedRequest | null {
  if (span.kind !== "SERVER") return null;
  const attrs = span.attributes;
  const method = String(attrs["http.method"] || "GET");
  const url = String(attrs["http.url"] || attrs["http.target"] || "/");
  const path = String(attrs["http.route"] || attrs["http.target"] || url);
  const status = Number(attrs["http.status_code"] || 200);
  const start = Number(span.startTimeUnixNano) / 1e6;
  const end = Number(span.endTimeUnixNano) / 1e6;
  const durationMs = end - start;

  const req: CapturedRequest = {
    id: `${span.traceId}/${span.spanId}`,
    method,
    url,
    path,
    headers: parseHeaders(attrs["http.request.headers"] as string),
    body: attrs["http.request.body"] ?? null,
    timestamp: start,
    traceId: span.traceId,
    spanId: span.spanId,
    durationMs,
    responseStatus: status,
    responseBody: attrs["http.response.body"] ?? null,
    responseHeaders: parseHeaders(attrs["http.response.headers"] as string),
  };
  return req;
}

/** Parse a batch of spans, keeping only the SERVER-kind HTTP spans. */
export function parseSpanBatch(spans: OtelSpan[]): CapturedRequest[] {
  return spans
    .map(spanToRequest)
    .filter((r): r is CapturedRequest => r !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function parseHeaders(raw?: string): Record<string, string> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
