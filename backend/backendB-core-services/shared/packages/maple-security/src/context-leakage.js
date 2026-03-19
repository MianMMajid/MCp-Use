import { randomUUID } from "node:crypto";
import { scanForPII } from "./dlp-engine.js";

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);

const STREET_SUFFIX_CANONICAL = new Map([
  ["street", "st"],
  ["st", "st"],
  ["avenue", "ave"],
  ["ave", "ave"],
  ["road", "rd"],
  ["rd", "rd"],
  ["drive", "dr"],
  ["dr", "dr"],
  ["lane", "ln"],
  ["ln", "ln"],
  ["boulevard", "blvd"],
  ["blvd", "blvd"],
  ["parkway", "pkwy"],
  ["pkwy", "pkwy"],
  ["expressway", "expy"],
  ["expy", "expy"],
  ["court", "ct"],
  ["ct", "ct"],
  ["way", "way"],
  ["terrace", "ter"],
  ["ter", "ter"],
  ["place", "pl"],
  ["pl", "pl"],
  ["circle", "cir"],
  ["cir", "cir"],
]);

const ADDRESS_REGEX = /\b(?<line1>\d{1,6}\s+[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,6}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Parkway|Pkwy|Expressway|Expy|Court|Ct|Way|Terrace|Ter|Place|Pl|Circle|Cir)\.?)\s*,\s*(?<city>[A-Za-z][A-Za-z.'\- ]{1,80}?)\s*,\s*(?<state>[A-Z]{2})\s+(?<postal>\d{5}(?:-\d{4})?)\b/g;

const CUSTOM_LITERAL_REGEX = /\b(?:avoid|do not leak|never send|redact|protect)\b\s*:?\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^\n]+))/gi;

const BLOCK_ONLY_CATEGORIES = new Set([
  "ssn",
  "credit_card",
  "medical_record_number",
  "secret",
  "private_key",
  "api_token",
  "credential",
]);

const PLACEHOLDER_BY_CATEGORY = Object.freeze({
  phone: "[PHONE]",
  us_phone: "[PHONE]",
  international_phone: "[PHONE]",
  email: "[EMAIL]",
  patient_name: "[PATIENT]",
  date_of_birth: "[DOB]",
  medical_record_number: "[MRN]",
  custom_literal: "[REDACTED]",
});

const CATEGORY_ALIASES = Object.freeze({
  us_street_address: "address",
  address: "address",
  home_address: "address",
  work_address: "address",
  us_phone: "phone",
  international_phone: "phone",
  email: "email",
  patient_name: "patient_name",
  date_of_birth: "date_of_birth",
  medical_record_number: "medical_record_number",
  ssn: "ssn",
  credit_card: "credit_card",
  custom_literal: "custom_literal",
});

function canonicalCategory(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  return CATEGORY_ALIASES[raw] ?? raw;
}

function collapseWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalizeEmail(value) {
  return collapseWhitespace(value).toLowerCase();
}

function normalizeAddressValue(value) {
  const normalized = collapseWhitespace(value)
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const tokens = normalized.split(" ").map((token) => {
    const suffix = STREET_SUFFIX_CANONICAL.get(token);
    return suffix ?? token;
  });
  return tokens.join(" ");
}

export function normalizeLeakageValue(value, category) {
  const normalizedCategory = canonicalCategory(category);
  if (normalizedCategory === "address") {
    return normalizeAddressValue(value);
  }
  if (normalizedCategory === "phone") {
    return normalizePhone(value);
  }
  if (normalizedCategory === "email") {
    return normalizeEmail(value);
  }
  return collapseWhitespace(value).toLowerCase();
}

export function detectStreetAddresses(text) {
  const findings = [];
  const source = String(text ?? "");
  let match;
  while ((match = ADDRESS_REGEX.exec(source)) !== null) {
    const value = match[0];
    const city = collapseWhitespace(match.groups?.city ?? "");
    const state = String(match.groups?.state ?? "").trim().toUpperCase();
    if (!city || !US_STATE_CODES.has(state)) {
      continue;
    }
    findings.push({
      pattern: "us_street_address",
      category: "pii",
      severity: "high",
      matchedText: value,
      startIndex: match.index,
      endIndex: match.index + value.length,
      metadata: {
        city,
        state,
        postalCode: String(match.groups?.postal ?? "").trim(),
        line1: collapseWhitespace(match.groups?.line1 ?? ""),
      },
    });
  }
  return findings;
}

export function deriveCoarseLocation(value, metadata = {}) {
  const directCity = collapseWhitespace(metadata.city);
  const directState = String(metadata.state ?? "").trim().toUpperCase();
  if (directCity && directState) {
    return `${directCity}, ${directState}`;
  }
  if (directCity) {
    return directCity;
  }

  const match = ADDRESS_REGEX.exec(String(value ?? ""));
  ADDRESS_REGEX.lastIndex = 0;
  const city = collapseWhitespace(match?.groups?.city ?? "");
  const state = String(match?.groups?.state ?? "").trim().toUpperCase();
  if (city && state) {
    return `${city}, ${state}`;
  }
  if (city) {
    return city;
  }
  return "";
}

function inferReplacementStrategy(category, value, metadata = {}) {
  const normalizedCategory = canonicalCategory(category);
  if (normalizedCategory === "address") {
    const coarseLocation = deriveCoarseLocation(value, metadata);
    return coarseLocation
      ? { action: "rewrite", replacementValue: coarseLocation, replacementStrategy: "coarse_location" }
      : { action: "block", replacementValue: "", replacementStrategy: "block" };
  }
  if (BLOCK_ONLY_CATEGORIES.has(normalizedCategory)) {
    return { action: "block", replacementValue: "", replacementStrategy: "block" };
  }
  const placeholder = PLACEHOLDER_BY_CATEGORY[normalizedCategory];
  if (placeholder) {
    return { action: "placeholder_redact", replacementValue: placeholder, replacementStrategy: "placeholder" };
  }
  return { action: "block", replacementValue: "", replacementStrategy: "block" };
}

function severityRank(value) {
  switch (String(value ?? "").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function deduplicateEntities(items) {
  const next = new Map();
  for (const item of items) {
    const key = `${canonicalCategory(item.category)}::${normalizeLeakageValue(item.valueText, item.category)}`;
    const existing = next.get(key);
    if (!existing || severityRank(item.severity) > severityRank(existing.severity)) {
      next.set(key, item);
    }
  }
  return [...next.values()];
}

function detectCustomLiteralHints(text) {
  const matches = [];
  const source = String(text ?? "");
  let match;
  while ((match = CUSTOM_LITERAL_REGEX.exec(source)) !== null) {
    const raw = collapseWhitespace(match[1] ?? match[2] ?? match[3] ?? "");
    if (raw.length < 6) {
      continue;
    }
    matches.push(raw);
  }
  return matches;
}

export function extractLeakageEntitiesFromText(text, options = {}) {
  const source = String(text ?? "");
  const policyMode = String(options.policyMode ?? "strict").trim().toLowerCase() || "strict";
  const createdAt = options.createdAt || new Date().toISOString();
  const documentId = options.documentId || "";
  const piiFindings = scanForPII(source);
  const addressFindings = detectStreetAddresses(source);
  const entities = [];

  for (const finding of [...piiFindings, ...addressFindings]) {
    const category = canonicalCategory(finding.pattern);
    const replacement = inferReplacementStrategy(category, finding.matchedText, finding.metadata);
    entities.push({
      entityId: `leak-${randomUUID()}`,
      documentId,
      category,
      valueText: finding.matchedText,
      normalizedValue: normalizeLeakageValue(finding.matchedText, category),
      displayText: redactDisplayValue(finding.matchedText, category),
      replacementStrategy: replacement.replacementStrategy,
      replacementValue: replacement.replacementValue,
      action: replacement.action,
      severity: finding.severity ?? "medium",
      metadata: {
        ...(finding.metadata ?? {}),
        detector: finding.pattern,
      },
      policyMode,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  for (const rawLiteral of detectCustomLiteralHints(source)) {
    const category = "custom_literal";
    const replacement = inferReplacementStrategy(category, rawLiteral, {});
    entities.push({
      entityId: `leak-${randomUUID()}`,
      documentId,
      category,
      valueText: rawLiteral,
      normalizedValue: normalizeLeakageValue(rawLiteral, category),
      displayText: redactDisplayValue(rawLiteral, category),
      replacementStrategy: replacement.replacementStrategy,
      replacementValue: replacement.replacementValue,
      action: replacement.action,
      severity: "high",
      metadata: {
        detector: "custom_literal_hint",
      },
      policyMode,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  return deduplicateEntities(entities);
}

export function redactDisplayValue(value, category) {
  const text = collapseWhitespace(value);
  const normalizedCategory = canonicalCategory(category);
  if (!text) {
    return "";
  }
  if (normalizedCategory === "address") {
    const coarse = deriveCoarseLocation(text);
    return coarse ? `[ADDRESS:${coarse}]` : "[ADDRESS]";
  }
  if (normalizedCategory === "phone") {
    const digits = normalizePhone(text);
    const tail = digits.slice(-2);
    return tail ? `[PHONE:***${tail}]` : "[PHONE]";
  }
  if (normalizedCategory === "email") {
    const [localPart = "", domain = ""] = normalizeEmail(text).split("@");
    const prefix = localPart.slice(0, 1);
    return `[EMAIL:${prefix || "*"}***@${domain || "***"}]`;
  }
  return `[${normalizedCategory.toUpperCase()}]`;
}

function findLiteralOccurrences(text, entity) {
  const source = String(text ?? "");
  const rawValue = collapseWhitespace(entity.valueText);
  if (!rawValue) {
    return [];
  }
  const category = canonicalCategory(entity.category);
  if (category === "phone") {
    const regex = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    const matches = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      if (normalizePhone(match[0]) === normalizeLeakageValue(rawValue, category)) {
        matches.push({ startIndex: match.index, endIndex: match.index + match[0].length, matchedText: match[0] });
      }
    }
    return matches;
  }
  const regex = new RegExp(escapeRegex(rawValue), "gi");
  const matches = [];
  let match;
  while ((match = regex.exec(source)) !== null) {
    matches.push({ startIndex: match.index, endIndex: match.index + match[0].length, matchedText: match[0] });
  }
  return matches;
}

function detectBuiltInSensitiveMatches(text, options = {}) {
  const source = String(text ?? "");
  const matches = [];
  for (const finding of [...scanForPII(source), ...detectStreetAddresses(source)]) {
    const category = canonicalCategory(finding.pattern);
    const replacement = inferReplacementStrategy(category, finding.matchedText, finding.metadata);
    matches.push({
      entityId: "",
      documentId: "",
      category,
      matchedText: finding.matchedText,
      normalizedValue: normalizeLeakageValue(finding.matchedText, category),
      startIndex: finding.startIndex,
      endIndex: finding.endIndex,
      action: replacement.action,
      replacementValue: replacement.replacementValue,
      replacementStrategy: replacement.replacementStrategy,
      source: "builtin",
      severity: finding.severity ?? "medium",
      metadata: finding.metadata ?? {},
      policyMode: options.policyMode ?? "strict",
    });
  }
  return matches;
}

function decideMatchAction(match, context = {}) {
  const category = canonicalCategory(match.category);
  if (category === "address") {
    const coarse = match.replacementValue || deriveCoarseLocation(match.matchedText, match.metadata);
    if (coarse) {
      return { action: "rewrite", replacementValue: coarse, blocked: false };
    }
    return { action: "block", replacementValue: "", blocked: true };
  }
  if (BLOCK_ONLY_CATEGORIES.has(category)) {
    return { action: "block", replacementValue: "", blocked: true };
  }
  const toolName = String(context.toolName ?? "").toLowerCase();
  const text = String(context.text ?? "").toLowerCase();
  const isResearchLike =
    /search|find|look up|research|recommend|restaurants|reddit|google|where i live|near me/.test(text) ||
    toolName === "web_search" ||
    toolName === "web_fetch" ||
    toolName === "openai_web_search";

  if (category === "phone" || category === "email") {
    if (isResearchLike) {
      return { action: "placeholder_redact", replacementValue: "", blocked: false };
    }
    return { action: "block", replacementValue: "", blocked: true };
  }
  if (category === "patient_name") {
    return { action: "placeholder_redact", replacementValue: "[PATIENT]", blocked: false };
  }
  if (category === "date_of_birth" || category === "medical_record_number") {
    return { action: "block", replacementValue: "", blocked: true };
  }
  if (match.action === "placeholder_redact" && match.replacementValue) {
    return { action: "placeholder_redact", replacementValue: match.replacementValue, blocked: false };
  }
  return { action: "block", replacementValue: "", blocked: true };
}

export function sanitizeTextWithLeakagePolicy(text, activeEntities = [], options = {}) {
  const source = String(text ?? "");
  const policyMode = String(options.policyMode ?? "strict").trim().toLowerCase() || "strict";
  const matches = [];

  for (const entity of Array.isArray(activeEntities) ? activeEntities : []) {
    if (!entity || entity.isActive === false) continue;
    for (const occurrence of findLiteralOccurrences(source, entity)) {
      matches.push({
        entityId: entity.entityId || "",
        documentId: entity.documentId || "",
        category: canonicalCategory(entity.category),
        matchedText: occurrence.matchedText,
        normalizedValue: normalizeLeakageValue(occurrence.matchedText, entity.category),
        startIndex: occurrence.startIndex,
        endIndex: occurrence.endIndex,
        action: entity.action || "block",
        replacementValue: entity.replacementValue || "",
        replacementStrategy: entity.replacementStrategy || "block",
        source: "policy",
        severity: entity.severity || "high",
        metadata: entity.metadata || {},
        policyMode: entity.policyMode || policyMode,
      });
    }
  }

  for (const builtin of detectBuiltInSensitiveMatches(source, { policyMode })) {
    const duplicate = matches.some((entry) =>
      entry.startIndex === builtin.startIndex &&
      entry.endIndex === builtin.endIndex &&
      entry.category === builtin.category
    );
    if (!duplicate) {
      matches.push(builtin);
    }
  }

  matches.sort((left, right) => right.startIndex - left.startIndex);

  let sanitizedText = source;
  let blocked = false;
  let blockedReason = "";
  const appliedMatches = [];

  for (const match of matches) {
    const decision = decideMatchAction(match, { text: source, toolName: options.toolName });
    const effectiveMode = String(match.policyMode || policyMode).toLowerCase();
    const record = {
      entityId: match.entityId,
      documentId: match.documentId,
      category: match.category,
      matchedText: match.matchedText,
      redactedMatchedText: redactDisplayValue(match.matchedText, match.category),
      action: decision.action,
      replacementValue: decision.replacementValue,
      source: match.source,
      startIndex: match.startIndex,
      endIndex: match.endIndex,
      severity: match.severity,
    };

    if (effectiveMode === "monitor") {
      appliedMatches.push(record);
      continue;
    }

    if (effectiveMode === "review") {
      blocked = true;
      blockedReason = blockedReason || `Sensitive ${match.category} requires review before outbound execution.`;
      appliedMatches.push({ ...record, action: "review" });
      continue;
    }

    if (decision.blocked) {
      blocked = true;
      blockedReason = blockedReason || `Sensitive ${match.category} cannot be safely generalized.`;
      appliedMatches.push(record);
      continue;
    }

    const replacement = decision.action === "rewrite"
      ? decision.replacementValue
      : decision.action === "placeholder_redact"
        ? decision.replacementValue
        : "";
    sanitizedText =
      sanitizedText.slice(0, match.startIndex) +
      replacement +
      sanitizedText.slice(match.endIndex);
    appliedMatches.push(record);
  }

  return {
    blocked,
    blockedReason,
    modified: sanitizedText !== source,
    sanitizedText,
    matches: appliedMatches.reverse(),
    confidence: matches.length > 0 ? 0.7 : 0,
  };
}

export function sanitizeStructuredContent(value, activeEntities = [], options = {}) {
  const matches = [];
  let blocked = false;
  let blockedReason = "";
  let modified = false;

  function walk(node) {
    if (typeof node === "string") {
      const result = sanitizeTextWithLeakagePolicy(node, activeEntities, options);
      if (result.blocked) {
        blocked = true;
        blockedReason = blockedReason || result.blockedReason;
      }
      if (result.modified) {
        modified = true;
      }
      matches.push(...result.matches);
      return result.sanitizedText;
    }
    if (Array.isArray(node)) {
      return node.map((entry) => walk(entry));
    }
    if (node && typeof node === "object") {
      const next = {};
      for (const [key, entry] of Object.entries(node)) {
        next[key] = walk(entry);
      }
      return next;
    }
    return node;
  }

  const sanitizedContent = walk(value);
  return {
    blocked,
    blockedReason,
    modified,
    sanitizedContent,
    matches,
    confidence: matches.length > 0 ? 0.7 : 0,
  };
}
