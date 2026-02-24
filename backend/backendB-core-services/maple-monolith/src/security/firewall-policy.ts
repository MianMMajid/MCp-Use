import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import type { RiskFlag, RiskSeverity, StepType, Trace, TraceStep } from "../core/types.js";

export type FirewallAction = "allow" | "deny" | "log_only";

interface SecretPattern {
  name: string;
  regex: RegExp;
  entropyThreshold?: number;
}

interface FirewallRule {
  name: string;
  action: FirewallAction;
  severity: RiskSeverity;
  message: string;
  recommendation: string;
  match: {
    stepTypes?: StepType[];
    toolGlob?: string;
    anyValueRegex?: RegExp;
    secrets?: boolean;
    payloadBytesExceeds?: number;
  };
}

interface FirewallDecision {
  action: FirewallAction;
  rule: FirewallRule | null;
  secretPattern?: string;
}

interface FirewallAuditEntry {
  ts: string;
  traceId: string;
  sessionId: string;
  source: string;
  stepIndex: number;
  eventId: string;
  action: FirewallAction;
  rule: string | null;
  message: string;
  secretPattern?: string;
  redactedPatterns?: string[];
}

interface RedactionSummary {
  redacted: unknown;
  matches: Map<string, number>;
}

export interface FirewallEnforcementSummary {
  enabled: boolean;
  blockedSteps: number;
  redactedSteps: number;
  ruleHits: Record<string, number>;
  defaultAction: FirewallAction;
  enforcedAt: string;
}

export interface FirewallStepDecision {
  enabled: boolean;
  action: FirewallAction;
  shouldBlock: boolean;
  severity: RiskSeverity;
  message: string;
  recommendation: string;
  rule: string | null;
  secretPattern?: string;
  redactedPatterns: string[];
  evaluatedAt: string;
  step: TraceStep;
  defaultAction: FirewallAction;
}

const REDACTION_MARKER = "[REDACTED BY MAPLE]";
const RULESET_VERSION = "maple-fw-v1";
const firewallEnabled = parseBooleanEnv(process.env.MAPLE_FIREWALL_ENABLED, true);
const firewallDefaultAction = parseDefaultAction(process.env.MAPLE_FIREWALL_DEFAULT_ACTION);
const firewallLogDir = expandPath(
  process.env.MAPLE_FIREWALL_LOG_DIR ?? "~/.maple/firewall-logs"
);
const firewallLogPath = () => join(firewallLogDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
let auditLogWriteChain: Promise<void> = Promise.resolve();

const secretPatterns: SecretPattern[] = [
  { name: "aws-access-key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "github-token", regex: /(gh[ps]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
  { name: "openai-key", regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: "anthropic-key", regex: /sk-ant-[A-Za-z0-9-]{20,}/g },
  { name: "private-key-header", regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: "jwt-token", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "slack-token", regex: /xox[bpoas]-[A-Za-z0-9-]+/g },
  { name: "database-url", regex: /(postgres|mysql|mongodb|redis):\/\/[^\s]+/g },
  {
    name: "generic-secret-40",
    regex: /[A-Za-z0-9/+=]{40}/g,
    entropyThreshold: 4.5,
  },
];

const defaultRules: FirewallRule[] = [
  {
    name: "block-ssh-keys",
    action: "deny",
    severity: "critical",
    message: "Blocked: access to SSH private key material.",
    recommendation: "Deny and isolate trace immediately.",
    match: {
      anyValueRegex: /(\.ssh\/|id_rsa|id_ed25519|id_ecdsa)/i,
    },
  },
  {
    name: "block-env-files",
    action: "deny",
    severity: "high",
    message: "Blocked: access to .env files.",
    recommendation: "Do not expose environment files to autonomous tools.",
    match: {
      anyValueRegex: /(^|\/)\.env($|\.|\/)/i,
    },
  },
  {
    name: "block-credential-files",
    action: "deny",
    severity: "high",
    message: "Blocked: access to credential stores.",
    recommendation: "Restrict access to credential files and agent auth stores.",
    match: {
      anyValueRegex: /(\.aws\/credentials|\.npmrc|\.docker\/config\.json|\.kube\/config|auth-profiles\.json)/i,
    },
  },
  {
    name: "block-destructive-commands",
    action: "deny",
    severity: "critical",
    message: "Blocked: destructive command pattern detected.",
    recommendation: "Require explicit human override outside autonomous flow.",
    match: {
      stepTypes: ["shell", "tool_call", "prompt"],
      anyValueRegex: /(rm\s+-r|rm\s+-f|mkfs|dd\s+if=|format\s+[A-Z]:|del\s+\/[qfs])/i,
    },
  },
  {
    name: "block-pipe-to-shell",
    action: "deny",
    severity: "critical",
    message: "Blocked: remote content piped to shell.",
    recommendation: "Enforce checksum and pinned source before execution.",
    match: {
      stepTypes: ["shell", "tool_call", "prompt"],
      anyValueRegex: /(curl|wget|fetch)[^|\n]*\|\s*(bash|sh|zsh|python|node)/i,
    },
  },
  {
    name: "block-reverse-shells",
    action: "deny",
    severity: "critical",
    message: "Blocked: reverse shell pattern detected.",
    recommendation: "Quarantine the trace and inspect intent.",
    match: {
      stepTypes: ["shell", "tool_call", "prompt"],
      anyValueRegex: /(nc\s+-[el]|\/dev\/tcp\/|bash\s+-i\s+>&|mkfifo|socat)/i,
    },
  },
  {
    name: "block-secret-leakage",
    action: "deny",
    severity: "high",
    message: "Blocked: secret/API key pattern detected in step payload.",
    recommendation: "Rotate affected credentials and scrub logs/artifacts.",
    match: {
      secrets: true,
    },
  },
  {
    name: "log-large-payload",
    action: "log_only",
    severity: "low",
    message: "Large payload observed in trace step.",
    recommendation: "Review for unnecessary data transfer.",
    match: {
      payloadBytesExceeds: 100 * 1024,
    },
  },
];

export function enforceTraceFirewall(trace: Trace): FirewallEnforcementSummary {
  const enforcedAt = new Date().toISOString();
  if (!firewallEnabled) {
    trace.metadata = {
      ...(trace.metadata ?? {}),
      firewall: {
        enabled: false,
        defaultAction: firewallDefaultAction,
        enforcedAt,
      },
    };
    return {
      enabled: false,
      blockedSteps: 0,
      redactedSteps: 0,
      ruleHits: {},
      defaultAction: firewallDefaultAction,
      enforcedAt,
    };
  }

  let redactedSteps = 0;
  const ruleHits = new Map<string, number>();

  for (const step of trace.steps) {
    const decision = evaluateStep(step);
    const redaction = redactStepSecrets(step);
    const eventId = resolveStepEventId(step);
    const matchedRuleName = decision.rule?.name ?? "default";

    const previousDecisionKey =
      step.metadata && typeof step.metadata.mapleFirewallDecisionKey === "string"
        ? String(step.metadata.mapleFirewallDecisionKey)
        : "";

    const firewallPayload = {
      action: decision.action,
      rule: decision.rule?.name ?? null,
      redactedPatterns: [...redaction.matches.keys()].sort(),
      secretPattern: decision.secretPattern ?? null,
      marker: REDACTION_MARKER,
      ruleset: RULESET_VERSION,
    };
    const decisionKey = createHash("sha256").update(JSON.stringify(firewallPayload)).digest("hex");

    const firewallMetadata: Record<string, unknown> =
      step.metadata && typeof step.metadata.firewall === "object"
        ? ({ ...(step.metadata.firewall as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    firewallMetadata.action = decision.action;
    firewallMetadata.rule = decision.rule?.name ?? null;
    firewallMetadata.message = decision.rule?.message ?? `Default firewall action: ${firewallDefaultAction}`;
    firewallMetadata.evaluatedAt = enforcedAt;
    firewallMetadata.redactedPatterns = [...redaction.matches.keys()];
    firewallMetadata.secretPattern = decision.secretPattern ?? null;
    firewallMetadata.ruleset = RULESET_VERSION;

    step.metadata = {
      ...(step.metadata ?? {}),
      firewall: firewallMetadata,
      mapleFirewallDecisionKey: decisionKey,
    };

    if (decision.action === "deny") {
      step.guardStatus = "block";
      trace.status = "quarantined";
      upsertFirewallRiskFlag(step, decision.rule);
    }

    if (redaction.matches.size > 0) {
      redactedSteps += 1;
    }

    if (decision.rule) {
      ruleHits.set(matchedRuleName, (ruleHits.get(matchedRuleName) ?? 0) + 1);
    }

    if (previousDecisionKey !== decisionKey) {
      logAuditEntry({
        ts: enforcedAt,
        traceId: trace.id,
        sessionId: trace.sessionId,
        source: trace.source,
        stepIndex: step.index,
        eventId,
        action: decision.action,
        rule: decision.rule?.name ?? null,
        message:
          decision.rule?.message ?? `No explicit rule matched. Applied default action: ${firewallDefaultAction}.`,
        secretPattern: decision.secretPattern,
        redactedPatterns: [...redaction.matches.keys()],
      });
    }
  }

  const blockedSteps = trace.steps.filter((step) => step.guardStatus === "block").length;
  if (blockedSteps > 0) {
    trace.status = "quarantined";
  } else if (trace.status === "quarantined") {
    trace.status = "active";
  }

  trace.metadata = {
    ...(trace.metadata ?? {}),
    firewall: {
      enabled: true,
      defaultAction: firewallDefaultAction,
      blockedSteps,
      redactedSteps,
      ruleHits: Object.fromEntries(ruleHits.entries()),
      enforcedAt,
      ruleset: RULESET_VERSION,
    },
  };

  return {
    enabled: true,
    blockedSteps,
    redactedSteps,
    ruleHits: Object.fromEntries(ruleHits.entries()),
    defaultAction: firewallDefaultAction,
    enforcedAt,
  };
}

export function evaluateFirewallStep(candidateStep: TraceStep): FirewallStepDecision {
  const evaluatedAt = new Date().toISOString();
  const step = cloneTraceStep(candidateStep);

  if (!firewallEnabled) {
    return {
      enabled: false,
      action: "allow",
      shouldBlock: false,
      severity: "low",
      message: "Firewall disabled; allowing action.",
      recommendation: "Enable MAPLE_FIREWALL_ENABLED for runtime policy enforcement.",
      rule: null,
      secretPattern: undefined,
      redactedPatterns: [],
      evaluatedAt,
      step,
      defaultAction: firewallDefaultAction,
    };
  }

  const decision = evaluateStep(step);
  const redaction = redactStepSecrets(step);

  const firewallMetadata: Record<string, unknown> =
    step.metadata && typeof step.metadata.firewall === "object"
      ? ({ ...(step.metadata.firewall as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  firewallMetadata.action = decision.action;
  firewallMetadata.rule = decision.rule?.name ?? null;
  firewallMetadata.message = decision.rule?.message ?? `Default firewall action: ${firewallDefaultAction}`;
  firewallMetadata.evaluatedAt = evaluatedAt;
  firewallMetadata.redactedPatterns = [...redaction.matches.keys()];
  firewallMetadata.secretPattern = decision.secretPattern ?? null;
  firewallMetadata.ruleset = RULESET_VERSION;

  step.metadata = {
    ...(step.metadata ?? {}),
    firewall: firewallMetadata,
  };

  if (decision.action === "deny") {
    step.guardStatus = "block";
    upsertFirewallRiskFlag(step, decision.rule);
  }

  return {
    enabled: true,
    action: decision.action,
    shouldBlock: decision.action === "deny",
    severity: decision.rule?.severity ?? "low",
    message: decision.rule?.message ?? `No explicit rule matched. Applied default action: ${firewallDefaultAction}.`,
    recommendation:
      decision.rule?.recommendation ??
      "Allow only if expected for this task. Otherwise set guard action to block.",
    rule: decision.rule?.name ?? null,
    secretPattern: decision.secretPattern ?? undefined,
    redactedPatterns: [...redaction.matches.keys()],
    evaluatedAt,
    step,
    defaultAction: firewallDefaultAction,
  };
}

function resolveStepEventId(step: TraceStep): string {
  if (step.metadata && typeof step.metadata.eventId === "string" && step.metadata.eventId.trim().length > 0) {
    return step.metadata.eventId;
  }
  return `${step.index}:${step.timestamp}:${step.actor}:${step.type}`;
}

function cloneTraceStep(step: TraceStep): TraceStep {
  const raw = JSON.parse(JSON.stringify(step)) as Partial<TraceStep>;
  const guardStatus =
    raw.guardStatus === "allow" || raw.guardStatus === "block" || raw.guardStatus === "pending"
      ? raw.guardStatus
      : "pending";

  return {
    index:
      typeof raw.index === "number" && Number.isFinite(raw.index) ? Math.trunc(raw.index) : 0,
    timestamp:
      typeof raw.timestamp === "string" && raw.timestamp.trim().length > 0
        ? raw.timestamp
        : new Date().toISOString(),
    actor:
      raw.actor === "agent" || raw.actor === "tool" || raw.actor === "system" || raw.actor === "user"
        ? raw.actor
        : "agent",
    type:
      raw.type === "prompt" ||
      raw.type === "tool_call" ||
      raw.type === "shell" ||
      raw.type === "browser" ||
      raw.type === "network" ||
      raw.type === "email" ||
      raw.type === "system"
        ? raw.type
        : "prompt",
    prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
    toolCall:
      raw.toolCall && typeof raw.toolCall === "object"
        ? (raw.toolCall as TraceStep["toolCall"])
        : undefined,
    output: typeof raw.output === "string" ? raw.output : undefined,
    command: typeof raw.command === "string" ? raw.command : undefined,
    externalUrl: typeof raw.externalUrl === "string" ? raw.externalUrl : undefined,
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
    riskScore:
      typeof raw.riskScore === "number" && Number.isFinite(raw.riskScore) ? raw.riskScore : 0,
    riskFlags: Array.isArray(raw.riskFlags) ? (raw.riskFlags as RiskFlag[]) : [],
    guardStatus,
  };
}

function upsertFirewallRiskFlag(step: TraceStep, rule: FirewallRule | null): void {
  const slug = rule?.name ?? "default-deny";
  const severity = rule?.severity ?? "high";
  const riskFlag: RiskFlag = {
    id: `firewall-${slug}-${step.index}`,
    type: `firewall_${slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
    severity,
    stepIndex: step.index,
    message: rule?.message ?? "Blocked by Maple firewall default policy.",
    recommendation:
      rule?.recommendation ?? "Review and explicitly authorize only if this action is expected.",
    evidence: summarizeStepEvidence(step),
  };

  const existing = Array.isArray(step.riskFlags) ? step.riskFlags : [];
  const withoutOld = existing.filter((flag) => flag.id !== riskFlag.id);
  step.riskFlags = [...withoutOld, riskFlag];
}

function summarizeStepEvidence(step: TraceStep): string {
  if (step.command) {
    return step.command.slice(0, 240);
  }
  if (step.externalUrl) {
    return step.externalUrl.slice(0, 240);
  }
  if (step.toolCall?.name) {
    return step.toolCall.name.slice(0, 240);
  }
  if (step.prompt) {
    return step.prompt.slice(0, 240);
  }
  if (step.output) {
    return step.output.slice(0, 240);
  }
  return `${step.actor}:${step.type}`;
}

function evaluateStep(step: TraceStep): FirewallDecision {
  const payloadText = stepToPayloadText(step);
  const payloadBytes = Buffer.byteLength(payloadText, "utf8");
  const secretHit = scanForSecret(step);

  for (const rule of defaultRules) {
    if (rule.match.stepTypes && !rule.match.stepTypes.includes(step.type)) {
      continue;
    }

    if (rule.match.toolGlob) {
      const toolName = step.toolCall?.name;
      if (!toolName || !globMatch(toolName, rule.match.toolGlob)) {
        continue;
      }
    }

    if (rule.match.anyValueRegex) {
      rule.match.anyValueRegex.lastIndex = 0;
      if (!rule.match.anyValueRegex.test(payloadText)) {
        continue;
      }
    }

    if (rule.match.payloadBytesExceeds !== undefined) {
      if (payloadBytes <= rule.match.payloadBytesExceeds) {
        continue;
      }
    }

    if (rule.match.secrets) {
      if (!secretHit) {
        continue;
      }
      return {
        action: rule.action,
        rule,
        secretPattern: secretHit,
      };
    }

    return {
      action: rule.action,
      rule,
      secretPattern: secretHit ?? undefined,
    };
  }

  return {
    action: firewallDefaultAction,
    rule: null,
    secretPattern: secretHit ?? undefined,
  };
}

function redactStepSecrets(step: TraceStep): RedactionSummary {
  const totalMatches = new Map<string, number>();

  const recordMatches = (matches: Map<string, number>) => {
    for (const [pattern, count] of matches.entries()) {
      totalMatches.set(pattern, (totalMatches.get(pattern) ?? 0) + count);
    }
  };

  const redactStringField = (value?: string) => {
    if (!value) {
      return value;
    }
    const result = redactValue(value);
    recordMatches(result.matches);
    return typeof result.redacted === "string" ? result.redacted : value;
  };

  step.prompt = redactStringField(step.prompt);
  step.output = redactStringField(step.output);
  step.command = redactStringField(step.command);
  step.externalUrl = redactStringField(step.externalUrl);

  if (step.toolCall) {
    step.toolCall.name = redactStringField(step.toolCall.name) ?? step.toolCall.name;
    if (step.toolCall.input !== undefined) {
      const result = redactValue(step.toolCall.input);
      recordMatches(result.matches);
      step.toolCall.input = result.redacted as Record<string, unknown>;
    }
    if (step.toolCall.output !== undefined) {
      const result = redactValue(step.toolCall.output);
      recordMatches(result.matches);
      step.toolCall.output = result.redacted;
    }
  }

  return {
    redacted: step,
    matches: totalMatches,
  };
}

function redactValue(value: unknown): RedactionSummary {
  const matches = new Map<string, number>();

  const redactString = (input: string): string => {
    let next = input;
    for (const pattern of secretPatterns) {
      const globalRegex = new RegExp(pattern.regex.source, "g");
      next = next.replace(globalRegex, (found) => {
        if (pattern.entropyThreshold !== undefined && shannonEntropy(found) < pattern.entropyThreshold) {
          return found;
        }
        matches.set(pattern.name, (matches.get(pattern.name) ?? 0) + 1);
        return REDACTION_MARKER;
      });
    }
    return next;
  };

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return redactString(node);
    }
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(node)) {
        out[key] = walk(entry);
      }
      return out;
    }
    return node;
  };

  return {
    redacted: walk(value),
    matches,
  };
}

function scanForSecret(value: unknown): string | null {
  if (typeof value === "string") {
    for (const pattern of secretPatterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(value);
      if (!match) {
        continue;
      }
      if (
        pattern.entropyThreshold !== undefined &&
        shannonEntropy(match[0]) < pattern.entropyThreshold
      ) {
        continue;
      }
      return pattern.name;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = scanForSecret(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      const found = scanForSecret(entry);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function stepToPayloadText(step: TraceStep): string {
  return JSON.stringify(
    {
      actor: step.actor,
      type: step.type,
      prompt: step.prompt,
      output: step.output,
      command: step.command,
      externalUrl: step.externalUrl,
      toolCall: step.toolCall,
      metadata: step.metadata,
    },
    null,
    2
  );
}

function logAuditEntry(entry: FirewallAuditEntry): void {
  auditLogWriteChain = auditLogWriteChain
    .catch(() => undefined)
    .then(async () => {
      await mkdir(firewallLogDir, { recursive: true });
      await appendFile(firewallLogPath(), `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    })
    .catch(() => {
      // Do not break runtime on logging failure.
    });
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parseDefaultAction(value: string | undefined): FirewallAction {
  const normalized = String(value ?? "allow").trim().toLowerCase();
  if (normalized === "deny" || normalized === "log_only") {
    return normalized;
  }
  return "allow";
}

function expandPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  return resolvePath(trimmed);
}

function globMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexSource = `^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`;
  const regex = new RegExp(regexSource, "i");
  return regex.test(value);
}

function shannonEntropy(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const freq = new Map<string, number>();
  for (const char of text) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
