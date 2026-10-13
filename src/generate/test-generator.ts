// src/generate/test-generator.ts — LLM + template-based regression test generation
// Takes a DiffResult + produces a Playwright API test that catches the drift.

import type { DiffResult, GeneratedTest } from "../types.js";
import { PLATFORM_CONFIG } from "../config.js";

/** Generate a regression test from a behavioral diff. */
export async function generateTest(diff: DiffResult): Promise<GeneratedTest> {
  const useLLM = PLATFORM_CONFIG.llmApiKey && PLATFORM_CONFIG.llmProvider !== "mock";
  if (useLLM) {
    return generateWithLLM(diff);
  }
  return generateFromTemplate(diff);
}

/** Template-based generator — produces real Playwright test code from the diff. */
function generateFromTemplate(diff: DiffResult): GeneratedTest {
  const isStatus = diff.kind === "status";
  const isLatency = diff.kind === "latency";
  const isBody = diff.kind === "body";

  const title = `regression: ${diff.endpoint} ${diff.kind} drift`;
  const code = `import { test, expect } from '@playwright/test';

test('${title}', async ({ request }) => {
  // Diff that triggered this test:
  // ${diff.detail}
  // prod: ${diff.prodStatus} (${diff.prodLatencyMs}ms) | staging: ${diff.stagingStatus} (${diff.stagingLatencyMs}ms)
  const res = await request.get('${diff.endpoint}');
  ${isStatus ? `expect(res.status()).toBe(${diff.prodStatus}); // prod status` : `expect(res.ok()).toBeTruthy();`}
  ${isLatency ? `const timing = Date.now(); await res.body(); expect(Date.now() - timing).toBeLessThan(${diff.prodLatencyMs * 2});` : ''}
  ${isBody ? `const body = await res.json();
${diff.bodyDiffs.slice(0, 5).map(d => `  expect(body).toHaveProperty('${d.path.split('.').pop()}');`).join('\n')}` : ''}
});`;

  return {
    id: `test-${diff.requestId.slice(0, 12)}`,
    endpoint: diff.endpoint,
    framework: "playwright",
    title,
    code,
    fromDiff: diff.requestId,
  };
}

/** LLM-based generator — sends the diff to an LLM for a richer test. */
async function generateWithLLM(diff: DiffResult): Promise<GeneratedTest> {
  const prompt = `Generate a Playwright API test that catches this behavioral drift:
Endpoint: ${diff.endpoint}
Diff kind: ${diff.kind}
Detail: ${diff.detail}
Prod: status=${diff.prodStatus} latency=${diff.prodLatencyMs}ms
Staging: status=${diff.stagingStatus} latency=${diff.stagingLatencyMs}ms
Body diffs: ${JSON.stringify(diff.bodyDiffs.slice(0, 5))}
Return ONLY the test code, no explanation.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${PLATFORM_CONFIG.llmApiKey}` },
      body: JSON.stringify({
        model: PLATFORM_CONFIG.testGenModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    const j: any = await res.json();
    const code = j.choices?.[0]?.message?.content || generateFromTemplate(diff).code;
    return {
      id: `test-${diff.requestId.slice(0, 12)}`,
      endpoint: diff.endpoint,
      framework: "playwright",
      title: `LLM: regression ${diff.endpoint} ${diff.kind}`,
      code,
      fromDiff: diff.requestId,
    };
  } catch {
    return generateFromTemplate(diff);
  }
}
