/**
 * policy-simulator.js
 *
 * Dry-run / simulation mode for modifier policy evaluation.
 * Answers "what would this policy block?" without executing anything.
 */

/**
 * Simulate a modifier execution against a policy.
 * Returns the full evaluation trace without actually running the command.
 */
export function simulateModifierPolicy(requestBody, policy) {
  const results = {
    allowed: true,
    blocked: false,
    reasons: [],
    warnings: [],
    evaluation: [],
  };

  const tool = String(requestBody?.tool ?? "").trim().toLowerCase();
  if (!tool) {
    results.blocked = true;
    results.reasons.push("tool is required");
    results.evaluation.push({ check: "tool_present", result: "fail" });
    return results;
  }

  // Check allowlist
  const allowedTools = policy.allowedTools ?? [];
  if (allowedTools.length > 0 && !allowedTools.includes(tool)) {
    results.blocked = true;
    results.reasons.push(`Tool '${tool}' is not on the allowlist`);
    results.evaluation.push({ check: "tool_allowlist", result: "blocked", tool, allowedTools });
  } else {
    results.evaluation.push({ check: "tool_allowlist", result: "pass", tool });
  }

  // Check dangerous tools
  const dangerousTools = policy.dangerousTools ?? [];
  if (dangerousTools.includes(tool)) {
    results.warnings.push(`Tool '${tool}' is classified as dangerous — requires HITL approval`);
    results.evaluation.push({ check: "dangerous_tool", result: "requires_approval", tool });
  } else {
    results.evaluation.push({ check: "dangerous_tool", result: "pass" });
  }

  // Check target profile
  const targetProfile = String(requestBody?.targetProfile ?? requestBody?.profile ?? "").trim().toLowerCase();
  const sourceProfile = String(requestBody?.sourceProfile ?? "").trim().toLowerCase();
  const blockedProfiles = policy.blockedTargetProfiles ?? [];

  if (targetProfile && sourceProfile && targetProfile === sourceProfile) {
    results.blocked = true;
    results.reasons.push("targetProfile must differ from sourceProfile");
    results.evaluation.push({ check: "profile_isolation", result: "blocked" });
  } else {
    results.evaluation.push({ check: "profile_isolation", result: "pass" });
  }

  if (targetProfile && blockedProfiles.includes(targetProfile)) {
    results.blocked = true;
    results.reasons.push(`targetProfile '${targetProfile}' is on the blocked list`);
    results.evaluation.push({ check: "blocked_profile", result: "blocked", targetProfile, blockedProfiles });
  } else {
    results.evaluation.push({ check: "blocked_profile", result: "pass" });
  }

  // Check constraints
  const constraints = policy.constraints ?? {};
  const requestedTimeout = Number(requestBody?.timeoutSeconds);
  if (Number.isFinite(requestedTimeout) && requestedTimeout > (constraints.maxTimeoutSeconds ?? 90)) {
    results.warnings.push(`Requested timeout ${requestedTimeout}s exceeds max ${constraints.maxTimeoutSeconds}s — will be capped`);
    results.evaluation.push({ check: "timeout_cap", result: "capped", requested: requestedTimeout, max: constraints.maxTimeoutSeconds });
  } else {
    results.evaluation.push({ check: "timeout_cap", result: "pass" });
  }

  const requestedBuffer = Number(requestBody?.maxBufferMb);
  if (Number.isFinite(requestedBuffer) && requestedBuffer > (constraints.maxBufferMb ?? 8)) {
    results.warnings.push(`Requested buffer ${requestedBuffer}MB exceeds max ${constraints.maxBufferMb}MB — will be capped`);
    results.evaluation.push({ check: "buffer_cap", result: "capped", requested: requestedBuffer, max: constraints.maxBufferMb });
  } else {
    results.evaluation.push({ check: "buffer_cap", result: "pass" });
  }

  // Check dev profile
  if (requestBody?.dev && !constraints.allowDevProfile) {
    results.blocked = true;
    results.reasons.push("Dev profile execution is not allowed by policy");
    results.evaluation.push({ check: "dev_profile", result: "blocked" });
  } else {
    results.evaluation.push({ check: "dev_profile", result: "pass" });
  }

  // Check unsafe args
  const DANGEROUS_ARG_PATTERNS = [
    /^--allow-unconfigured$/i,
    /^--unsafe$/i,
    /^--danger/i,
    /^--no-sandbox$/i,
    /^--bypass/i,
    /^--profile$/i,
    /^--profile=.*/i,
  ];
  const args = Array.isArray(requestBody?.args) ? requestBody.args : [];
  const unsafeArgs = [];
  for (const arg of args) {
    if (DANGEROUS_ARG_PATTERNS.some((p) => p.test(String(arg)))) {
      unsafeArgs.push(String(arg));
    }
  }
  if (unsafeArgs.length > 0) {
    results.blocked = true;
    results.reasons.push(`Unsafe arguments detected: ${unsafeArgs.join(", ")}`);
    results.evaluation.push({ check: "unsafe_args", result: "blocked", unsafeArgs });
  } else {
    results.evaluation.push({ check: "unsafe_args", result: "pass" });
  }

  // ── Phase 2: Input Rails ──
  if (policy.inputRails) {
    const inputText = JSON.stringify(requestBody);
    if (policy.inputRails.maxInputLength != null) {
      if (inputText.length > policy.inputRails.maxInputLength) {
        results.blocked = true;
        results.reasons.push(`Input length ${inputText.length} exceeds policy max ${policy.inputRails.maxInputLength}`);
        results.evaluation.push({ check: "input_max_length", result: "blocked", length: inputText.length, max: policy.inputRails.maxInputLength });
      } else {
        results.evaluation.push({ check: "input_max_length", result: "pass" });
      }
    }
    if (policy.inputRails.promptInjection) {
      results.evaluation.push({ check: "prompt_injection_detection", result: "active" });
    }
    if (Array.isArray(policy.inputRails.blockedPatterns) && policy.inputRails.blockedPatterns.length > 0) {
      let matched = false;
      for (const pattern of policy.inputRails.blockedPatterns) {
        try {
          const re = new RegExp(pattern, "i");
          if (re.test(inputText.slice(0, 50_000))) {
            results.blocked = true;
            results.reasons.push(`Input matches blocked pattern: ${pattern.slice(0, 80)}`);
            results.evaluation.push({ check: "input_blocked_pattern", result: "blocked", pattern });
            matched = true;
            break;
          }
        } catch { /* invalid regex — skip */ }
      }
      if (!matched) {
        results.evaluation.push({ check: "input_blocked_pattern", result: "pass", patternCount: policy.inputRails.blockedPatterns.length });
      }
    }
  }

  // ── Phase 2: Content Safety ──
  if (policy.contentSafety?.enabled) {
    const categories = policy.contentSafety.categories?.length > 0
      ? policy.contentSafety.categories
      : ["hate", "violence", "sexual", "self-harm", "criminal", "harassment"];
    const action = policy.contentSafety.action ?? "log";
    results.evaluation.push({
      check: "content_safety",
      result: "active",
      categories,
      action,
      note: action === "block" ? "Matching content will be blocked at runtime" : `Matching content will be ${action}ed at runtime`,
    });
  }

  // ── Phase 2: Rate Limits ──
  if (policy.rateLimits) {
    const parts = [];
    if (policy.rateLimits.maxRequestsPerMinute != null) {
      parts.push(`${policy.rateLimits.maxRequestsPerMinute} req/min`);
    }
    if (policy.rateLimits.maxTokensPerHour != null) {
      parts.push(`${policy.rateLimits.maxTokensPerHour} tokens/hr`);
    }
    results.warnings.push(`Rate limits active: ${parts.join(", ")} (${policy.rateLimits.windowType ?? "sliding"} window)`);
    results.evaluation.push({
      check: "rate_limits",
      result: "active",
      maxRequestsPerMinute: policy.rateLimits.maxRequestsPerMinute,
      maxTokensPerHour: policy.rateLimits.maxTokensPerHour,
      windowType: policy.rateLimits.windowType,
    });
  }

  // ── Phase 2: Output Rails ──
  if (policy.outputRails) {
    const parts = [];
    if (policy.outputRails.maxResponseTokens != null) {
      parts.push(`max ${policy.outputRails.maxResponseTokens} tokens`);
    }
    if (policy.outputRails.blockedOutputPatterns?.length > 0) {
      parts.push(`${policy.outputRails.blockedOutputPatterns.length} redaction pattern(s)`);
    }
    if (policy.outputRails.requireJsonSchema) {
      parts.push("JSON schema required");
    }
    results.warnings.push(`Output rails active: ${parts.join(", ")} — enforced post-execution`);
    results.evaluation.push({
      check: "output_rails",
      result: "active",
      maxResponseTokens: policy.outputRails.maxResponseTokens,
      patternCount: policy.outputRails.blockedOutputPatterns?.length ?? 0,
      requireJsonSchema: policy.outputRails.requireJsonSchema,
    });
  }

  results.allowed = !results.blocked;
  return results;
}

/**
 * Compare two policies side-by-side and return the differences.
 */
export function diffPolicies(policyA, policyB) {
  const diffs = [];

  // Compare arrays
  for (const key of ["allowedTools", "dangerousTools", "blockedTargetProfiles"]) {
    const a = new Set(policyA?.[key] ?? []);
    const b = new Set(policyB?.[key] ?? []);
    const added = [...b].filter((v) => !a.has(v));
    const removed = [...a].filter((v) => !b.has(v));
    if (added.length > 0 || removed.length > 0) {
      diffs.push({ field: key, added, removed });
    }
  }

  // Compare constraints
  const cA = policyA?.constraints ?? {};
  const cB = policyB?.constraints ?? {};
  for (const key of Object.keys({ ...cA, ...cB })) {
    if (cA[key] !== cB[key]) {
      diffs.push({ field: `constraints.${key}`, from: cA[key], to: cB[key] });
    }
  }

  return diffs;
}
