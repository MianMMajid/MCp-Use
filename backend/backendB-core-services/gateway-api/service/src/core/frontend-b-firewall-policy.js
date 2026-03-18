import { asString } from "../helpers.js";
import { parsePolicyDocument } from "./policy-as-code.js";
import { getDefaultOpenClawModifierPolicy } from "./openclaw-modifier-runtime.js";

function normalizeList(entries) {
  return [...new Set((entries ?? []).map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))];
}

function clonePolicy(policy = {}) {
  return {
    allowedTools: normalizeList(policy.allowedTools),
    dangerousTools: normalizeList(policy.dangerousTools),
    blockedTargetProfiles: normalizeList(policy.blockedTargetProfiles),
    constraints: {
      allowDevProfile: Boolean(policy.constraints?.allowDevProfile),
      maxTimeoutSeconds: Number(policy.constraints?.maxTimeoutSeconds ?? 90),
      maxBufferMb: Number(policy.constraints?.maxBufferMb ?? 8),
      approvalTtlSeconds: Number(policy.constraints?.approvalTtlSeconds ?? 900),
    },
    metadata: policy.metadata && typeof policy.metadata === "object" ? { ...policy.metadata } : {},
    inputRails: policy.inputRails ? {
      promptInjection: Boolean(policy.inputRails.promptInjection),
      maxInputLength: policy.inputRails.maxInputLength != null ? Number(policy.inputRails.maxInputLength) : null,
      blockedPatterns: normalizeList(policy.inputRails.blockedPatterns),
    } : null,
    contentSafety: policy.contentSafety ? {
      enabled: Boolean(policy.contentSafety.enabled),
      categories: normalizeList(policy.contentSafety.categories),
      action: String(policy.contentSafety.action ?? "log"),
    } : null,
    rateLimits: policy.rateLimits ? {
      maxRequestsPerMinute: Number(policy.rateLimits.maxRequestsPerMinute ?? 0) || null,
      maxTokensPerHour: Number(policy.rateLimits.maxTokensPerHour ?? 0) || null,
      windowType: String(policy.rateLimits.windowType ?? "sliding"),
    } : null,
    outputRails: policy.outputRails ? {
      maxResponseTokens: Number(policy.outputRails.maxResponseTokens ?? 0) || null,
      requireJsonSchema: Boolean(policy.outputRails.requireJsonSchema),
      blockedOutputPatterns: normalizeList(policy.outputRails.blockedOutputPatterns),
    } : null,
  };
}

function composeAllowedTools(defaultAllowedTools, policies) {
  const restrictivePolicies = policies.filter(
    (policy) => Array.isArray(policy.allowedTools) && policy.allowedTools.length > 0
  );
  if (restrictivePolicies.length === 0) {
    return normalizeList(defaultAllowedTools);
  }
  let allowed = normalizeList(defaultAllowedTools);
  for (const policy of restrictivePolicies) {
    const set = new Set(normalizeList(policy.allowedTools));
    allowed = allowed.filter((toolId) => set.has(toolId));
  }
  return allowed;
}

function composeConstraints(defaults, policies) {
  const allowDevProfile = [Boolean(defaults.allowDevProfile), ...policies.map((policy) => Boolean(policy.constraints?.allowDevProfile))]
    .every(Boolean);
  const maxTimeoutSeconds = Math.min(
    Number(defaults.maxTimeoutSeconds ?? 90),
    ...policies.map((policy) => Number(policy.constraints?.maxTimeoutSeconds ?? defaults.maxTimeoutSeconds ?? 90))
  );
  const maxBufferMb = Math.min(
    Number(defaults.maxBufferMb ?? 8),
    ...policies.map((policy) => Number(policy.constraints?.maxBufferMb ?? defaults.maxBufferMb ?? 8))
  );
  const approvalTtlSeconds = Math.min(
    Number(defaults.approvalTtlSeconds ?? 900),
    ...policies.map((policy) => Number(policy.constraints?.approvalTtlSeconds ?? defaults.approvalTtlSeconds ?? 900))
  );
  return {
    allowDevProfile,
    maxTimeoutSeconds,
    maxBufferMb,
    approvalTtlSeconds,
  };
}

const CONTENT_ACTION_PRIORITY = { block: 3, warn: 2, log: 1 };

function composeInputRails(policies) {
  const withRails = policies.filter((p) => p.inputRails != null);
  if (withRails.length === 0) return null;
  const promptInjection = withRails.some((p) => p.inputRails.promptInjection);
  const lengths = withRails.map((p) => p.inputRails.maxInputLength).filter((v) => v != null);
  const maxInputLength = lengths.length > 0 ? Math.min(...lengths) : null;
  const blockedPatterns = normalizeList(withRails.flatMap((p) => p.inputRails.blockedPatterns ?? []));
  return { promptInjection, maxInputLength, blockedPatterns };
}

function composeContentSafety(policies) {
  const withSafety = policies.filter((p) => p.contentSafety?.enabled);
  if (withSafety.length === 0) return null;
  const categories = normalizeList(withSafety.flatMap((p) => p.contentSafety.categories ?? []));
  const action = withSafety.reduce((strongest, p) => {
    const prio = CONTENT_ACTION_PRIORITY[p.contentSafety.action] ?? 0;
    return prio > (CONTENT_ACTION_PRIORITY[strongest] ?? 0) ? p.contentSafety.action : strongest;
  }, "log");
  return { enabled: true, categories: categories.length > 0 ? categories : ["hate", "violence", "sexual", "self-harm", "criminal", "harassment"], action };
}

function composeRateLimits(policies) {
  const withLimits = policies.filter((p) => p.rateLimits != null);
  if (withLimits.length === 0) return null;
  const rpm = withLimits.map((p) => p.rateLimits.maxRequestsPerMinute).filter((v) => v != null);
  const tph = withLimits.map((p) => p.rateLimits.maxTokensPerHour).filter((v) => v != null);
  const useSliding = withLimits.some((p) => p.rateLimits.windowType === "sliding");
  return {
    maxRequestsPerMinute: rpm.length > 0 ? Math.min(...rpm) : null,
    maxTokensPerHour: tph.length > 0 ? Math.min(...tph) : null,
    windowType: useSliding ? "sliding" : "fixed",
  };
}

function composeOutputRails(policies) {
  const withRails = policies.filter((p) => p.outputRails != null);
  if (withRails.length === 0) return null;
  const tokens = withRails.map((p) => p.outputRails.maxResponseTokens).filter((v) => v != null);
  const requireJson = withRails.some((p) => p.outputRails.requireJsonSchema);
  const patterns = normalizeList(withRails.flatMap((p) => p.outputRails.blockedOutputPatterns ?? []));
  return {
    maxResponseTokens: tokens.length > 0 ? Math.min(...tokens) : null,
    requireJsonSchema: requireJson,
    blockedOutputPatterns: patterns,
  };
}

function compileMetadata(policy = {}, context = {}) {
  return {
    ...(policy.metadata ?? {}),
    source: "frontend-b-firewall",
    firewallId: asString(context.firewallId) ?? "",
    firewallName: asString(context.firewallName) ?? "",
    firewallVersionId: asString(context.firewallVersionId) ?? "",
    scope: asString(context.scope) ?? "global",
    assignedAgentId: asString(context.assignedAgentId) ?? "",
    compiledAt: context.compiledAt ?? new Date().toISOString(),
  };
}

export function compileFrontendBFirewallPolicy(policyText, context = {}) {
  const compiledAt = new Date().toISOString();
  const normalizedText = String(policyText ?? "");
  if (!normalizedText.trim()) {
    return {
      ok: false,
      valid: false,
      compiledAt,
      policy: null,
      errors: ["policyText is required."],
      warnings: [],
      diagnostics: {
        source: "frontend-b-firewall",
        firewallId: asString(context.firewallId) ?? "",
        firewallVersionId: asString(context.firewallVersionId) ?? "",
      },
    };
  }

  try {
    const parsedPolicy = clonePolicy(parsePolicyDocument(normalizedText));
    parsedPolicy.metadata = compileMetadata(parsedPolicy, {
      ...context,
      compiledAt,
    });
    return {
      ok: true,
      valid: true,
      compiledAt,
      policy: parsedPolicy,
      errors: [],
      warnings: [],
      diagnostics: parsedPolicy.metadata,
    };
  } catch (error) {
    return {
      ok: false,
      valid: false,
      compiledAt,
      policy: null,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      diagnostics: {
        source: "frontend-b-firewall",
        firewallId: asString(context.firewallId) ?? "",
        firewallVersionId: asString(context.firewallVersionId) ?? "",
        scope: asString(context.scope) ?? "global",
        assignedAgentId: asString(context.assignedAgentId) ?? "",
        compiledAt,
      },
    };
  }
}

export function composeModifierPolicies(policies = [], options = {}) {
  const defaults = clonePolicy(options.defaults ?? getDefaultOpenClawModifierPolicy());
  const inputPolicies = policies.map((policy) => clonePolicy(policy)).filter(Boolean);
  return {
    allowedTools: composeAllowedTools(defaults.allowedTools, inputPolicies),
    dangerousTools: normalizeList([
      ...defaults.dangerousTools,
      ...inputPolicies.flatMap((policy) => policy.dangerousTools ?? []),
    ]),
    blockedTargetProfiles: normalizeList([
      ...defaults.blockedTargetProfiles,
      ...inputPolicies.flatMap((policy) => policy.blockedTargetProfiles ?? []),
    ]),
    constraints: composeConstraints(defaults.constraints ?? {}, inputPolicies),
    inputRails: composeInputRails(inputPolicies),
    contentSafety: composeContentSafety(inputPolicies),
    rateLimits: composeRateLimits(inputPolicies),
    outputRails: composeOutputRails(inputPolicies),
    metadata: {
      ...(defaults.metadata ?? {}),
      source: "frontend-b-firewalls",
      composedCount: inputPolicies.length,
      firewallSources: inputPolicies
        .map((policy) => ({
          firewallId: asString(policy.metadata?.firewallId) ?? "",
          firewallVersionId: asString(policy.metadata?.firewallVersionId) ?? "",
          scope: asString(policy.metadata?.scope) ?? "global",
          assignedAgentId: asString(policy.metadata?.assignedAgentId) ?? "",
        }))
        .filter((entry) => entry.firewallId || entry.firewallVersionId),
    },
  };
}

export function buildCompiledFirewallBundle(compiledFirewalls = [], options = {}) {
  const defaults = clonePolicy(options.defaults ?? getDefaultOpenClawModifierPolicy());
  const activePolicies = compiledFirewalls.filter(
    (entry) => entry && entry.archived !== true && entry.policy
  );
  const globalPolicies = activePolicies
    .filter((entry) => entry.scope !== "agent")
    .map((entry) => entry.policy);

  const agentIds = [...new Set(
    activePolicies
      .filter((entry) => entry.scope === "agent" && entry.assignedAgentId)
      .map((entry) => String(entry.assignedAgentId))
  )];

  const defaultPolicy = composeModifierPolicies(globalPolicies, { defaults });
  const agentPolicies = {};
  for (const agentId of agentIds) {
    const agentSpecificPolicies = activePolicies
      .filter((entry) => entry.scope === "agent" && String(entry.assignedAgentId) === agentId)
      .map((entry) => entry.policy);
    agentPolicies[agentId] = composeModifierPolicies([...globalPolicies, ...agentSpecificPolicies], {
      defaults,
    });
  }

  return {
    defaultPolicy,
    agentPolicies,
    metadata: {
      source: "frontend-b-firewalls",
      firewalls: activePolicies.map((entry) => ({
        firewallId: asString(entry.firewallId) ?? "",
        firewallVersionId: asString(entry.firewallVersionId) ?? "",
        scope: asString(entry.scope) ?? "global",
        assignedAgentId: asString(entry.assignedAgentId) ?? "",
      })),
    },
  };
}

export function buildModifierPolicyPayloadFromFirewallBundle(compiledFirewalls = [], options = {}) {
  const bundle = buildCompiledFirewallBundle(compiledFirewalls, options);
  return {
    ...bundle.defaultPolicy,
    agentPolicies: bundle.agentPolicies,
    metadata: {
      ...(bundle.defaultPolicy.metadata ?? {}),
      source: "frontend-b-firewalls",
      firewalls: bundle.metadata.firewalls,
    },
  };
}

export function resolveCompiledFirewallPolicy(bundle, agentId) {
  const normalizedAgentId = asString(agentId) ?? "";
  if (normalizedAgentId && bundle?.agentPolicies?.[normalizedAgentId]) {
    return {
      policy: bundle.agentPolicies[normalizedAgentId],
      scope: `agent:${normalizedAgentId}`,
    };
  }
  return {
    policy: bundle?.defaultPolicy ?? getDefaultOpenClawModifierPolicy(),
    scope: "default",
  };
}
