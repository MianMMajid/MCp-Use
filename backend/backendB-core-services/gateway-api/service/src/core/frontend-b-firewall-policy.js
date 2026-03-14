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
