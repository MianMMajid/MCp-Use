import assert from "node:assert/strict";
import test from "node:test";

import { CircuitBreaker } from "../src/circuit-breaker.js";

test("CircuitBreaker: starts in closed state", () => {
  const cb = new CircuitBreaker("test-1");
  assert.equal(cb.getState(), "closed");
});

test("CircuitBreaker: stays closed on successful calls", async () => {
  const cb = new CircuitBreaker("test-2");
  const result = await cb.execute(() => Promise.resolve("ok"));
  assert.equal(result, "ok");
  assert.equal(cb.getState(), "closed");
});

test("CircuitBreaker: opens after failureThreshold consecutive failures", async () => {
  const cb = new CircuitBreaker("test-3", { failureThreshold: 3 });

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  }

  assert.equal(cb.getState(), "open");
});

test("CircuitBreaker: rejects calls when open", async () => {
  const cb = new CircuitBreaker("test-4", { failureThreshold: 2, resetTimeoutMs: 60000 });

  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  }

  await assert.rejects(
    () => cb.execute(() => Promise.resolve("ok")),
    /OPEN/
  );
});

test("CircuitBreaker: transitions to half_open after resetTimeoutMs", async () => {
  const cb = new CircuitBreaker("test-5", { failureThreshold: 2, resetTimeoutMs: 50 });

  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  }

  assert.equal(cb.getState(), "open");

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(cb.getState(), "half_open");
});

test("CircuitBreaker: closes on success in half_open state", async () => {
  const cb = new CircuitBreaker("test-6", { failureThreshold: 2, resetTimeoutMs: 50 });

  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  }

  await new Promise((resolve) => setTimeout(resolve, 60));

  const result = await cb.execute(() => Promise.resolve("recovered"));
  assert.equal(result, "recovered");
  assert.equal(cb.getState(), "closed");
});

test("CircuitBreaker: re-opens on failure in half_open state", async () => {
  const cb = new CircuitBreaker("test-7", { failureThreshold: 2, resetTimeoutMs: 50 });

  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  }

  await new Promise((resolve) => setTimeout(resolve, 60));

  await assert.rejects(() => cb.execute(() => Promise.reject(new Error("still failing"))));
  assert.equal(cb.getState(), "open");
});

test("CircuitBreaker: reset() forces closed state", async () => {
  const cb = new CircuitBreaker("test-8", { failureThreshold: 2 });

  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  }

  assert.equal(cb.getState(), "open");
  cb.reset();
  assert.equal(cb.getState(), "closed");

  const result = await cb.execute(() => Promise.resolve("ok"));
  assert.equal(result, "ok");
});

test("CircuitBreaker: failure count resets on success", async () => {
  const cb = new CircuitBreaker("test-9", { failureThreshold: 3 });

  // 2 failures
  await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));

  // 1 success resets the count
  await cb.execute(() => Promise.resolve("ok"));

  // 2 more failures should not trigger open (need 3 consecutive)
  await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));
  await assert.rejects(() => cb.execute(() => Promise.reject(new Error("fail"))));

  assert.equal(cb.getState(), "closed");
});
