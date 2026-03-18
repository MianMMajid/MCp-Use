import assert from "node:assert/strict";
import test from "node:test";

import {
  detectStreetAddresses,
  deriveCoarseLocation,
  extractLeakageEntitiesFromText,
  sanitizeStructuredContent,
  sanitizeTextWithLeakagePolicy,
} from "../src/context-leakage.js";

test("detectStreetAddresses finds US street addresses and coarse location", () => {
  const findings = detectStreetAddresses("My home is 2788 San Tomas Expy, Santa Clara, CA 95051.");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].pattern, "us_street_address");
  assert.equal(deriveCoarseLocation(findings[0].matchedText, findings[0].metadata), "Santa Clara, CA");
});

test("extractLeakageEntitiesFromText promotes uploaded policy text into enforceable entities", () => {
  const entities = extractLeakageEntitiesFromText("Avoid: My address: 2788 San Tomas Expy, Santa Clara, CA 95051", {
    documentId: "doc-1",
    policyMode: "strict",
  });
  assert.ok(entities.some((entity) => entity.category === "address"));
  const address = entities.find((entity) => entity.category === "address");
  assert.equal(address.replacementValue, "Santa Clara, CA");
});

test("sanitizeTextWithLeakagePolicy rewrites addresses for research prompts", () => {
  const entities = extractLeakageEntitiesFromText("Avoid: My address: 2788 San Tomas Expy, Santa Clara, CA 95051", {
    documentId: "doc-1",
    policyMode: "strict",
  });
  const result = sanitizeTextWithLeakagePolicy(
    "Ask people on reddit if there is a good restaurant where I live, I live at 2788 San Tomas Expy, Santa Clara, CA 95051.",
    entities,
    { toolName: "web_search", policyMode: "strict" },
  );
  assert.equal(result.blocked, false);
  assert.equal(result.modified, true);
  assert.match(result.sanitizedText, /Santa Clara, CA/);
  assert.ok(!/2788 San Tomas Expy/.test(result.sanitizedText));
});

test("sanitizeTextWithLeakagePolicy strips phone numbers from research prompts", () => {
  const result = sanitizeTextWithLeakagePolicy(
    "Search for a florist near me and call me at 415-555-1212 when you find one.",
    [],
    { toolName: "web_search", policyMode: "strict" },
  );
  assert.equal(result.blocked, false);
  assert.equal(result.modified, true);
  assert.ok(!/415-555-1212/.test(result.sanitizedText));
});

test("sanitizeTextWithLeakagePolicy blocks patient identifiers in strict mode", () => {
  const result = sanitizeTextWithLeakagePolicy(
    "Research this patient: Jane Doe, DOB 01/01/1990, MRN 123456.",
    [],
    { toolName: "web_search", policyMode: "strict" },
  );
  assert.equal(result.blocked, true);
  assert.match(result.blockedReason, /Sensitive/);
});

test("sanitizeStructuredContent rewrites outbound query payloads", () => {
  const entities = extractLeakageEntitiesFromText("Avoid: My address: 2788 San Tomas Expy, Santa Clara, CA 95051", {
    documentId: "doc-1",
    policyMode: "strict",
  });
  const result = sanitizeStructuredContent({
    query: "restaurants near 2788 San Tomas Expy, Santa Clara, CA 95051",
    maxResults: 5,
  }, entities, {
    toolName: "web_search",
    policyMode: "strict",
  });
  assert.equal(result.blocked, false);
  assert.equal(result.modified, true);
  assert.equal(result.sanitizedContent.query, "restaurants near Santa Clara, CA");
});
