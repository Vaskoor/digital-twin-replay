// tests/diff.test.ts — tests for the diff engine
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diffBodies, bodyDriftScore } from "../src/diff/body-diff.ts";
import { diffLatency } from "../src/diff/latency-diff.ts";
import { diffStatus } from "../src/diff/status-diff.ts";

describe("body-diff", () => {
  test("identical bodies produce no diffs", () => {
    assert.equal(diffBodies({ a: 1 }, { a: 1 }).length, 0);
  });
  test("detects changed primitive", () => {
    const d = diffBodies({ a: 1 }, { a: 2 });
    assert.equal(d.length, 1);
    assert.equal(d[0].kind, "changed");
    assert.equal(d[0].path, "a");
  });
  test("detects added key", () => {
    const d = diffBodies({ a: 1 }, { a: 1, b: 2 });
    assert.equal(d.length, 1);
    assert.equal(d[0].kind, "added");
  });
  test("detects removed key", () => {
    const d = diffBodies({ a: 1, b: 2 }, { a: 1 });
    assert.equal(d.length, 1);
    assert.equal(d[0].kind, "removed");
  });
  test("handles nested objects", () => {
    const d = diffBodies({ user: { name: "x" } }, { user: { name: "y" } });
    assert.equal(d.length, 1);
    assert.equal(d[0].path, "user.name");
  });
  test("handles arrays", () => {
    const d = diffBodies([1, 2], [1, 3]);
    assert.equal(d.length, 1);
    assert.equal(d[0].path, "[1]");
  });
});

describe("bodyDriftScore", () => {
  test("0% for identical", () => {
    assert.equal(bodyDriftScore({ a: 1, b: 2 }, { a: 1, b: 2 }), 0);
  });
  test("50% for one of two keys changed", () => {
    assert.equal(bodyDriftScore({ a: 1, b: 2 }, { a: 1, b: 3 }), 50);
  });
  test("100% when all keys differ", () => {
    assert.equal(bodyDriftScore({ a: 1 }, { a: 2 }), 100);
  });
});

describe("latency-diff", () => {
  test("no regression when within budget", () => {
    const d = diffLatency(100, 110, 800);
    assert.equal(d.regression, false);
    assert.equal(d.severity, "none");
  });
  test("medium regression when >50% slower", () => {
    const d = diffLatency(100, 160, 800);
    assert.equal(d.regression, true);
    assert.equal(d.severity, "medium");
  });
  test("critical when >200% slower", () => {
    const d = diffLatency(100, 310, 800);
    assert.equal(d.severity, "critical");
  });
});

describe("status-diff", () => {
  test("match when same status", () => {
    assert.equal(diffStatus(200, 200).match, true);
  });
  test("critical when prod 2xx → staging 5xx", () => {
    assert.equal(diffStatus(200, 503).severity, "critical");
  });
  test("high when prod 2xx → staging 4xx", () => {
    assert.equal(diffStatus(200, 404).severity, "high");
  });
});
