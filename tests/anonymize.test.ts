// tests/anonymize.test.ts — tests for the PII scrubber + token rotation
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scrubPII, scrubObject } from "../src/anonymize/pii-scrubber.ts";
import { rotateTokens, resetRotations } from "../src/anonymize/token-rotation.ts";

describe("pii-scrubber", () => {
  test("scrubs emails", () => {
    const { cleaned, fields } = scrubPII("contact user@example.com");
    assert.ok(cleaned.includes("[email-redacted]"));
    assert.ok(fields.includes("email"));
  });
  test("scrubs phone numbers", () => {
    const { cleaned, fields } = scrubPII("call +1-555-123-4567");
    assert.ok(cleaned.includes("[phone-redacted]"));
    assert.ok(fields.includes("phone"));
  });
  test("scrubs API keys", () => {
    const { cleaned, fields } = scrubPII("auth: sk-abc123def456ghi789jkl012mno345");
    assert.ok(fields.includes("api-key"));
    assert.ok(!cleaned.includes("sk-abc"));
  });
  test("scrubs multiple PII types in one string", () => {
    const { fields } = scrubPII("email: a@b.com, phone: 555-123-4567, ip: 10.0.0.1");
    assert.ok(fields.includes("email"));
    assert.ok(fields.includes("phone"));
    assert.ok(fields.includes("ipv4"));
  });
  test("returns no fields for clean string", () => {
    const { fields } = scrubPII("just a normal string");
    assert.equal(fields.length, 0);
  });
});

describe("scrubObject", () => {
  test("deep-scrubs nested objects", () => {
    const { _piiFields } = scrubObject({ user: { email: "x@y.com" } });
    assert.ok(_piiFields.includes("email"));
  });
  test("scrubs arrays of strings", () => {
    const { _piiFields } = scrubObject({ emails: ["a@b.com", "c@d.com"] });
    assert.ok(_piiFields.includes("email"));
  });
});

describe("token-rotation", () => {
  test("rotates authorization header", () => {
    resetRotations();
    const { headers, rotations } = rotateTokens({ Authorization: "Bearer abc123" });
    assert.ok(headers.Authorization.startsWith("replay-"));
    assert.equal(rotations.length, 1);
    assert.equal(rotations[0].field, "Authorization");
  });
  test("does not rotate non-auth headers", () => {
    resetRotations();
    const { rotations } = rotateTokens({ "Content-Type": "application/json" });
    assert.equal(rotations.length, 0);
  });
  test("deterministic rotation (same input → same output)", () => {
    resetRotations();
    const r1 = rotateTokens({ "x-api-key": "secret123" });
    resetRotations();
    const r2 = rotateTokens({ "x-api-key": "secret123" });
    assert.equal(r1.headers["x-api-key"], r2.headers["x-api-key"]);
  });
});
