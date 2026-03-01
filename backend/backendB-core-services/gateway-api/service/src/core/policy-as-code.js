/**
 * policy-as-code.js
 *
 * Parse and validate declarative YAML policy documents into the internal
 * modifier policy format. Supports allowedTools, blockedTools, dangerousTools,
 * constraints, and approval rules.
 *
 * Accepts both raw YAML strings and pre-parsed JS objects.
 */
import jsYaml from "js-yaml";
import { simulateModifierPolicy, diffPolicies } from "./policy-simulator.js";

const SUPPORTED_VERSIONS = [1];

const VALID_CONSTRAINT_KEYS = new Set([
  "maxTimeoutSeconds",
  "maxBufferMb",
  "allowDevProfile",
  "approvalTtlSeconds",
]);

/**
 * Parse a raw YAML string into a JS object.
 * If the input is already an object, returns it directly.
 */
export function parseYaml(input) {
  if (input && typeof input === "object") return input;
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("YAML input must be a non-empty string or object.");
  }
  try {
    const parsed = jsYaml.load(input);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("YAML did not parse into an object.");
    }
    return parsed;
  } catch (err) {
    throw new Error(`YAML parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Parse a policy document from raw YAML string or pre-parsed JS object
 * into the internal policy format.
 */
export function parsePolicyDocument(input) {
  const doc = parseYaml(input);
  if (!doc || typeof doc !== "object") {
    throw new Error("Policy document must be a non-null object.");
  }

  const errors = validatePolicyDocument(doc);
  if (errors.length > 0) {
    throw new Error(`Invalid policy document: ${errors.join("; ")}`);
  }

  const rules = doc.rules ?? {};
  const approval = rules.approval ?? {};

  const policy = {
    allowedTools: toStringArray(rules.allowedTools),
    dangerousTools: toStringArray(rules.dangerousTools),
    blockedTargetProfiles: toStringArray(rules.blockedTargetProfiles),
    constraints: {},
    metadata: {
      source: "policy-as-code",
      version: doc.version ?? 1,
      tenant: doc.tenant ?? "",
      org: doc.org ?? "",
    },
  };

  // Map constraints
  if (rules.constraints) {
    if (typeof rules.constraints.maxTimeoutSeconds === "number") {
      policy.constraints.maxTimeoutSeconds = rules.constraints.maxTimeoutSeconds;
    }
    if (typeof rules.constraints.maxBufferMb === "number") {
      policy.constraints.maxBufferMb = rules.constraints.maxBufferMb;
    }
    if (typeof rules.constraints.allowDevProfile === "boolean") {
      policy.constraints.allowDevProfile = rules.constraints.allowDevProfile;
    }
  }

  // Map approval rules into constraints
  if (approval.ttlSeconds != null) {
    policy.constraints.approvalTtlSeconds = Number(approval.ttlSeconds);
  }
  if (typeof approval.requireForDangerous === "boolean") {
    policy.metadata.requireApprovalForDangerous = approval.requireForDangerous;
  }

  return policy;
}

/**
 * Validate a policy document against the schema.
 * Returns an array of error strings (empty if valid).
 */
export function validatePolicyDocument(doc) {
  const errors = [];

  if (!doc || typeof doc !== "object") {
    errors.push("Document must be a non-null object");
    return errors;
  }

  // Version
  if (doc.version != null && !SUPPORTED_VERSIONS.includes(doc.version)) {
    errors.push(`Unsupported version: ${doc.version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}`);
  }

  // Rules
  const rules = doc.rules;
  if (rules != null && typeof rules !== "object") {
    errors.push("rules must be an object");
    return errors;
  }

  if (rules) {
    // Array fields
    for (const key of ["allowedTools", "dangerousTools", "blockedTargetProfiles"]) {
      if (rules[key] != null && !Array.isArray(rules[key])) {
        errors.push(`rules.${key} must be an array`);
      }
    }

    // Constraints
    if (rules.constraints != null) {
      if (typeof rules.constraints !== "object") {
        errors.push("rules.constraints must be an object");
      } else {
        for (const key of Object.keys(rules.constraints)) {
          if (!VALID_CONSTRAINT_KEYS.has(key)) {
            errors.push(`Unknown constraint key: ${key}`);
          }
        }
        if (rules.constraints.maxTimeoutSeconds != null && typeof rules.constraints.maxTimeoutSeconds !== "number") {
          errors.push("rules.constraints.maxTimeoutSeconds must be a number");
        }
        if (rules.constraints.maxBufferMb != null && typeof rules.constraints.maxBufferMb !== "number") {
          errors.push("rules.constraints.maxBufferMb must be a number");
        }
      }
    }

    // Approval rules
    if (rules.approval != null) {
      if (typeof rules.approval !== "object") {
        errors.push("rules.approval must be an object");
      } else {
        if (rules.approval.ttlSeconds != null && typeof rules.approval.ttlSeconds !== "number") {
          errors.push("rules.approval.ttlSeconds must be a number");
        }
        if (rules.approval.requireForDangerous != null && typeof rules.approval.requireForDangerous !== "boolean") {
          errors.push("rules.approval.requireForDangerous must be a boolean");
        }
      }
    }
  }

  return errors;
}

/**
 * Dry-run a policy document against a sample request.
 * Returns simulation result without activating anything.
 */
export function dryRunPolicy(policyInput, sampleRequest) {
  const policy = parsePolicyDocument(policyInput);
  return {
    parsedPolicy: policy,
    validation: validatePolicyDocument(parseYaml(policyInput)),
    simulation: simulateModifierPolicy(sampleRequest ?? {}, policy),
  };
}

/**
 * Diff a new policy document against an existing active policy.
 * Returns the parsed new policy + array of diffs.
 */
export function diffBeforeApply(newPolicyInput, currentPolicy) {
  const newPolicy = parsePolicyDocument(newPolicyInput);
  const diffs = diffPolicies(currentPolicy ?? {}, newPolicy);
  return {
    newPolicy,
    diffs,
    hasChanges: diffs.length > 0,
  };
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim().toLowerCase()).filter((v) => v.length > 0);
}
