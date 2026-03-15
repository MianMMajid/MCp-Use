import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { detectPromptInjection } from "./prompt-injection.js";
import { scanForPII, redactPII, classifyDlpSeverity } from "./dlp-engine.js";
const REDACTION_MARKER = "[REDACTED BY MAPLE]";
const RULESET_VERSION = "maple-fw-v1";
const firewallEnabled = parseBooleanEnv(process.env.MAPLE_FIREWALL_ENABLED, true);
const firewallDefaultAction = parseDefaultAction(process.env.MAPLE_FIREWALL_DEFAULT_ACTION);
if (!process.env.MAPLE_FIREWALL_LOG_DIR) {
    throw new Error("Missing required environment variable: MAPLE_FIREWALL_LOG_DIR");
}
const firewallLogDir = expandPath(process.env.MAPLE_FIREWALL_LOG_DIR);
const firewallLogPath = () => join(firewallLogDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
let auditLogWriteChain = Promise.resolve();
const secretPatterns = [
    { name: "aws-access-key", regex: /AKIA[0-9A-Z]{16}/g },
    { name: "github-token", regex: /(gh[ps]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
    { name: "openai-key", regex: /sk-[A-Za-z0-9]{20,}/g },
    { name: "anthropic-key", regex: /sk-ant-[A-Za-z0-9-]{20,}/g },
    { name: "private-key-header", regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
    { name: "jwt-token", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    { name: "slack-token", regex: /xox[bpoas]-[A-Za-z0-9-]+/g },
    { name: "database-url", regex: /(postgres|mysql|mongodb|redis):\/\/[^\s]+/g },
    { name: "generic-secret-40", regex: /[A-Za-z0-9/+=]{40}/g, entropyThreshold: 4.5 },
];
const defaultRules = [
    {
        name: "block-ssh-keys", action: "deny", severity: "critical",
        message: "Blocked: access to SSH private key material.",
        recommendation: "Deny and isolate trace immediately.",
        match: { anyValueRegex: /(\.ssh\/|id_rsa|id_ed25519|id_ecdsa)/i },
    },
    {
        name: "block-env-files", action: "deny", severity: "high",
        message: "Blocked: access to .env files.",
        recommendation: "Do not expose environment files to autonomous tools.",
        match: { anyValueRegex: /(^|\/)\.env($|\.|\/)/i },
    },
    {
        name: "block-credential-files", action: "deny", severity: "high",
        message: "Blocked: access to credential stores.",
        recommendation: "Restrict access to credential files and agent auth stores.",
        match: { anyValueRegex: /(\.aws\/credentials|\.npmrc|\.docker\/config\.json|\.kube\/config|auth-profiles\.json)/i },
    },
    {
        name: "block-destructive-commands", action: "deny", severity: "critical",
        message: "Blocked: destructive command pattern detected.",
        recommendation: "Require explicit human override outside autonomous flow.",
        match: { stepTypes: ["shell", "tool_call", "prompt"], anyValueRegex: /(rm\s+-r|rm\s+-f|mkfs|dd\s+if=|format\s+[A-Z]:|del\s+\/[qfs])/i },
    },
    {
        name: "block-pipe-to-shell", action: "deny", severity: "critical",
        message: "Blocked: remote content piped to shell.",
        recommendation: "Enforce checksum and pinned source before execution.",
        match: { stepTypes: ["shell", "tool_call", "prompt"], anyValueRegex: /(curl|wget|fetch)[^|\n]*\|\s*(bash|sh|zsh|python|node)/i },
    },
    {
        name: "block-reverse-shells", action: "deny", severity: "critical",
        message: "Blocked: reverse shell pattern detected.",
        recommendation: "Quarantine the trace and inspect intent.",
        match: { stepTypes: ["shell", "tool_call", "prompt"], anyValueRegex: /(nc\s+-[el]|\/dev\/tcp\/|bash\s+-i\s+>&|mkfifo|socat)/i },
    },
    {
        name: "block-malicious-skill-install", action: "deny", severity: "critical",
        message: "Blocked: malicious skill/plugin pattern detected.",
        recommendation: "Quarantine and review skill source before installation.",
        match: { stepTypes: ["tool_call", "prompt"], anyValueRegex: /(keylog|atomic[\.\-_]?stealer|screen[\.\-_]?capture|clipboard[\.\-_]?monitor|eval\s*\(|child_process|new\s+Function)/i },
    },
    {
        name: "block-sandbox-escape", action: "deny", severity: "critical",
        message: "Blocked: sandbox escape or elevated privilege pattern detected.",
        recommendation: "Deny and audit. Never allow sandbox bypass in autonomous execution.",
        match: { stepTypes: ["shell", "tool_call", "prompt"], anyValueRegex: /(--elevated|--allowHostControl|--privileged|--(?:bind-)?mount[= ].*(?:src|source|dst|destination|target)=\/?(?:etc|root|proc|sys|dev|var\/run)|--bind-mount=\/?(?:etc|root|proc|sys|dev|var\/run)|--pid=host|--network=host|--cap-add|allowHostControl.*true|hostAccess.*true)/i },
    },
    {
        name: "block-secret-leakage", action: "deny", severity: "high",
        message: "Blocked: secret/API key pattern detected in step payload.",
        recommendation: "Rotate affected credentials and scrub logs/artifacts.",
        match: { secrets: true },
    },
    {
        name: "log-large-payload", action: "log_only", severity: "low",
        message: "Large payload observed in trace step.",
        recommendation: "Review for unnecessary data transfer.",
        match: { payloadBytesExceeds: 100 * 1024 },
    },
];
export function enforceTraceFirewall(trace, externalRules) {
    const enforcedAt = new Date().toISOString();
    if (!firewallEnabled) {
        trace.metadata = { ...(trace.metadata ?? {}), firewall: { enabled: false, defaultAction: firewallDefaultAction, enforcedAt } };
        return { enabled: false, blockedSteps: 0, redactedSteps: 0, ruleHits: {}, defaultAction: firewallDefaultAction, enforcedAt };
    }
    let redactedSteps = 0;
    const ruleHits = new Map();
    for (const step of trace.steps) {
        const decision = evaluateStep(step, externalRules);
        const redaction = redactStepSecrets(step);
        const eventId = resolveStepEventId(step);
        const matchedRuleName = decision.rule?.name ?? "default";
        const previousDecisionKey = step.metadata && typeof step.metadata.mapleFirewallDecisionKey === "string" ? String(step.metadata.mapleFirewallDecisionKey) : "";
        const firewallPayload = { action: decision.action, rule: decision.rule?.name ?? null, redactedPatterns: [...redaction.matches.keys()].sort(), secretPattern: decision.secretPattern ?? null, marker: REDACTION_MARKER, ruleset: RULESET_VERSION };
        const decisionKey = createHash("sha256").update(JSON.stringify(firewallPayload)).digest("hex");
        const firewallMetadata = step.metadata && typeof step.metadata.firewall === "object" ? ({ ...step.metadata.firewall }) : {};
        firewallMetadata.action = decision.action;
        firewallMetadata.rule = decision.rule?.name ?? null;
        firewallMetadata.message = decision.rule?.message ?? `Default firewall action: ${firewallDefaultAction}`;
        firewallMetadata.evaluatedAt = enforcedAt;
        firewallMetadata.redactedPatterns = [...redaction.matches.keys()];
        firewallMetadata.secretPattern = decision.secretPattern ?? null;
        firewallMetadata.ruleset = RULESET_VERSION;
        step.metadata = { ...(step.metadata ?? {}), firewall: firewallMetadata, mapleFirewallDecisionKey: decisionKey };
        if (decision.action === "deny") {
            step.guardStatus = "block";
            trace.status = "quarantined";
            upsertFirewallRiskFlag(step, decision.rule);
        }
        if (redaction.matches.size > 0)
            redactedSteps += 1;
        if (decision.rule)
            ruleHits.set(matchedRuleName, (ruleHits.get(matchedRuleName) ?? 0) + 1);
        if (previousDecisionKey !== decisionKey) {
            logAuditEntry({ ts: enforcedAt, traceId: trace.id, sessionId: trace.sessionId, source: trace.source, stepIndex: step.index, eventId, action: decision.action, rule: decision.rule?.name ?? null, message: decision.rule?.message ?? `No explicit rule matched. Applied default action: ${firewallDefaultAction}.`, secretPattern: decision.secretPattern, redactedPatterns: [...redaction.matches.keys()] });
        }
    }
    const blockedSteps = trace.steps.filter((step) => step.guardStatus === "block").length;
    if (blockedSteps > 0)
        trace.status = "quarantined";
    else if (trace.status === "quarantined")
        trace.status = "active";
    trace.metadata = { ...(trace.metadata ?? {}), firewall: { enabled: true, defaultAction: firewallDefaultAction, blockedSteps, redactedSteps, ruleHits: Object.fromEntries(ruleHits.entries()), enforcedAt, ruleset: RULESET_VERSION } };
    return { enabled: true, blockedSteps, redactedSteps, ruleHits: Object.fromEntries(ruleHits.entries()), defaultAction: firewallDefaultAction, enforcedAt };
}
export function evaluateFirewallStep(candidateStep, externalRules) {
    const evaluatedAt = new Date().toISOString();
    const step = cloneTraceStep(candidateStep);
    if (!firewallEnabled) {
        return { enabled: false, action: "allow", shouldBlock: false, severity: "low", message: "Firewall disabled; allowing action.", recommendation: "Enable MAPLE_FIREWALL_ENABLED for runtime policy enforcement.", rule: null, redactedPatterns: [], evaluatedAt, defaultAction: firewallDefaultAction, step: candidateStep };
    }
    const decision = evaluateStep(step, externalRules);
    const redaction = redactStepSecrets(step);
    // Attach prompt injection scan results to step metadata for downstream visibility
    if (step.prompt) {
        const injectionResult = detectPromptInjection(step.prompt);
        step.metadata = { ...(step.metadata ?? {}), promptInjection: { isInjection: injectionResult.isInjection, confidence: injectionResult.confidence, patterns: injectionResult.matches.map(m => m.pattern), categories: injectionResult.categories } };
    }
    if (decision.action === "deny") {
        step.guardStatus = "block";
        upsertFirewallRiskFlag(step, decision.rule);
    }
    return { enabled: true, action: decision.action, shouldBlock: decision.action === "deny", severity: decision.rule?.severity ?? "low", message: decision.rule?.message ?? `No explicit rule matched. Applied default action: ${firewallDefaultAction}.`, recommendation: decision.rule?.recommendation ?? "Allow only if expected for this task. Otherwise set guard action to block.", rule: decision.rule?.name ?? null, secretPattern: decision.secretPattern ?? undefined, redactedPatterns: [...redaction.matches.keys()], evaluatedAt, defaultAction: firewallDefaultAction, step };
}
function resolveStepEventId(step) {
    if (step.metadata && typeof step.metadata.eventId === "string" && step.metadata.eventId.trim().length > 0)
        return step.metadata.eventId;
    return `${step.index}:${step.timestamp}:${step.actor}:${step.type}`;
}
function cloneTraceStep(step) {
    const raw = JSON.parse(JSON.stringify(step));
    const guardStatus = raw.guardStatus === "allow" || raw.guardStatus === "block" || raw.guardStatus === "pending" ? raw.guardStatus : "pending";
    return {
        index: typeof raw.index === "number" && Number.isFinite(raw.index) ? Math.trunc(raw.index) : 0,
        timestamp: typeof raw.timestamp === "string" && raw.timestamp.trim().length > 0 ? raw.timestamp : new Date().toISOString(),
        actor: raw.actor === "agent" || raw.actor === "tool" || raw.actor === "system" || raw.actor === "user" ? raw.actor : "agent",
        type: raw.type === "prompt" || raw.type === "tool_call" || raw.type === "shell" || raw.type === "browser" || raw.type === "network" || raw.type === "email" || raw.type === "system" ? raw.type : "prompt",
        prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
        toolCall: raw.toolCall && typeof raw.toolCall === "object" ? raw.toolCall : undefined,
        output: typeof raw.output === "string" ? raw.output : undefined,
        command: typeof raw.command === "string" ? raw.command : undefined,
        externalUrl: typeof raw.externalUrl === "string" ? raw.externalUrl : undefined,
        metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : undefined,
        riskScore: typeof raw.riskScore === "number" && Number.isFinite(raw.riskScore) ? raw.riskScore : 0,
        riskFlags: Array.isArray(raw.riskFlags) ? raw.riskFlags : [],
        guardStatus,
    };
}
function upsertFirewallRiskFlag(step, rule) {
    const slug = rule?.name ?? "default-deny";
    const severity = rule?.severity ?? "high";
    const riskFlag = {
        id: `firewall-${slug}-${step.index}`,
        type: `firewall_${slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        severity, stepIndex: step.index,
        message: rule?.message ?? "Blocked by Maple firewall default policy.",
        recommendation: rule?.recommendation ?? "Review and explicitly authorize only if this action is expected.",
        evidence: summarizeStepEvidence(step),
    };
    const existing = Array.isArray(step.riskFlags) ? step.riskFlags : [];
    step.riskFlags = [...existing.filter((f) => f.id !== riskFlag.id), riskFlag];
}
function summarizeStepEvidence(step) {
    if (step.command)
        return step.command.slice(0, 240);
    if (step.externalUrl)
        return step.externalUrl.slice(0, 240);
    if (step.toolCall?.name)
        return step.toolCall.name.slice(0, 240);
    if (step.prompt)
        return step.prompt.slice(0, 240);
    if (step.output)
        return step.output.slice(0, 240);
    return `${step.actor}:${step.type}`;
}
function extractPolicyContext(step) {
    const metadata = step.metadata && typeof step.metadata === "object"
        ? step.metadata
        : {};
    return {
        tenantId: typeof metadata.tenantId === "string" ? metadata.tenantId.trim() : "",
        userId: typeof metadata.userId === "string" ? metadata.userId.trim() : "",
        deviceId: typeof metadata.deviceId === "string" ? metadata.deviceId.trim() : "",
        sourceService: typeof metadata.sourceService === "string" ? metadata.sourceService.trim() : "",
    };
}
function evaluateStep(step, externalRules) {
    const payloadText = stepToPayloadText(step);
    const payloadBytes = Buffer.byteLength(payloadText, "utf8");
    const secretHit = scanForSecret(step);
    const context = extractPolicyContext(step);
    if ((step.type === "tool_call" || step.type === "network" || step.type === "shell") &&
        (!context.tenantId || !context.userId || !context.deviceId)) {
        const missing = [
            !context.tenantId ? "tenant_id" : "",
            !context.userId ? "user_id" : "",
            !context.deviceId ? "device_id" : "",
        ].filter((entry) => entry.length > 0);
        const contextRule = {
            name: "block-missing-request-context",
            action: "deny",
            severity: "high",
            message: `Blocked: missing request context fields (${missing.join(", ")}).`,
            recommendation: "Propagate tenant_id, user_id, and device_id on every privileged action.",
            match: {},
        };
        return { action: "deny", rule: contextRule, secretPattern: secretHit ?? undefined };
    }
    // Prompt injection check: if step is prompt-type and injection confidence >= 0.7, deny
    if (step.type === "prompt" && step.prompt) {
        const injectionResult = detectPromptInjection(step.prompt);
        if (injectionResult.isInjection && injectionResult.confidence >= 0.7) {
            const injectionRule = {
                name: "block-prompt-injection",
                action: "deny",
                severity: "critical",
                message: `Blocked: prompt injection detected (confidence ${(injectionResult.confidence * 100).toFixed(0)}%, patterns: ${injectionResult.matches.map(m => m.pattern).join(", ")}).`,
                recommendation: "Review and sanitize prompt content before submission.",
                match: {},
            };
            return { action: "deny", rule: injectionRule, secretPattern: secretHit ?? undefined };
        }
    }
    // Indirect injection check: scan output content in tool_call/network steps.
    // Output content (fetched docs, API responses) frequently contains benign
    // instructional language, so we use a higher threshold (0.85) and only
    // hard-deny at very high confidence (>= 0.9). Lower-confidence matches
    // are logged but not blocked to avoid false positives on benign content.
    if ((step.type === "tool_call" || step.type === "network") && step.output) {
        const outputInjection = detectPromptInjection(step.output);
        if (outputInjection.isInjection && outputInjection.confidence >= 0.85) {
            const action = outputInjection.confidence >= 0.9 ? "deny" : "log_only";
            const indirectRule = {
                name: action === "deny" ? "block-indirect-injection" : "flag-indirect-injection",
                action,
                severity: action === "deny" ? "critical" : "high",
                message: `${action === "deny" ? "Blocked" : "Flagged"}: indirect prompt injection in step output (confidence ${(outputInjection.confidence * 100).toFixed(0)}%, patterns: ${outputInjection.matches.map(m => m.pattern).join(", ")}).`,
                recommendation: "Sanitize fetched content before passing to LLM context.",
                match: {},
            };
            return { action, rule: indirectRule, secretPattern: secretHit ?? undefined };
        }
    }
    // DLP/PII check: scan payload text for PII, block if critical/high severity
    const piiFindings = scanForPII(payloadText);
    if (piiFindings.length > 0) {
        const dlpSeverity = classifyDlpSeverity(piiFindings);
        if (dlpSeverity === "critical" || dlpSeverity === "high") {
            const piiRule = {
                name: "block-pii-leakage",
                action: "deny",
                severity: dlpSeverity,
                message: `Blocked: PII/PHI data detected (${piiFindings.map(f => f.pattern).join(", ")}).`,
                recommendation: "Remove or redact sensitive data before processing.",
                match: {},
            };
            return { action: "deny", rule: piiRule, secretPattern: secretHit ?? undefined };
        }
    }
    // Merge external rules ahead of defaults (external override same-name defaults)
    const mergedRules = mergeRules(defaultRules, externalRules);
    const ACTION_SEVERITY = { deny: 3, log_only: 2, allow: 1 };
    let worstMatch = null;
    for (const rule of mergedRules) {
        if (rule.match.stepTypes && !rule.match.stepTypes.includes(step.type))
            continue;
        if (rule.match.toolGlob) {
            const toolName = step.toolCall?.name;
            if (!toolName || !globMatch(toolName, rule.match.toolGlob))
                continue;
        }
        if (rule.match.anyValueRegex) {
            rule.match.anyValueRegex.lastIndex = 0;
            if (!rule.match.anyValueRegex.test(payloadText))
                continue;
        }
        if (rule.match.payloadBytesExceeds !== undefined && payloadBytes <= rule.match.payloadBytesExceeds)
            continue;
        if (rule.match.secrets) {
            if (!secretHit)
                continue;
            const candidate = { action: rule.action, rule, secretPattern: secretHit };
            if (!worstMatch || ACTION_SEVERITY[rule.action] > ACTION_SEVERITY[worstMatch.action]) {
                worstMatch = candidate;
            }
            continue;
        }
        const candidate = { action: rule.action, rule, secretPattern: secretHit ?? undefined };
        if (!worstMatch || ACTION_SEVERITY[rule.action] > ACTION_SEVERITY[worstMatch.action]) {
            worstMatch = candidate;
        }
    }
    return worstMatch ?? { action: firewallDefaultAction, rule: null, secretPattern: secretHit ?? undefined };
}
function mergeRules(defaults, external) {
    if (!external || external.length === 0)
        return defaults;
    const externalNames = new Set(external.map((r) => r.name));
    const filteredDefaults = defaults.filter((r) => !externalNames.has(r.name));
    return [...external, ...filteredDefaults];
}
function redactStepSecrets(step) {
    const totalMatches = new Map();
    const recordMatches = (matches) => { for (const [p, c] of matches.entries())
        totalMatches.set(p, (totalMatches.get(p) ?? 0) + c); };
    const redactStringField = (value) => { if (!value)
        return value; const r = redactValue(value); recordMatches(r.matches); return typeof r.redacted === "string" ? r.redacted : value; };
    step.prompt = redactStringField(step.prompt);
    step.output = redactStringField(step.output);
    step.command = redactStringField(step.command);
    step.externalUrl = redactStringField(step.externalUrl);
    if (step.toolCall) {
        step.toolCall.name = redactStringField(step.toolCall.name) ?? step.toolCall.name;
        if (step.toolCall.input !== undefined) {
            const r = redactValue(step.toolCall.input);
            recordMatches(r.matches);
            step.toolCall.input = r.redacted;
        }
        if (step.toolCall.output !== undefined) {
            const r = redactValue(step.toolCall.output);
            recordMatches(r.matches);
            step.toolCall.output = r.redacted;
        }
    }
    // Also run PII scan+redact on string fields
    const piiRedactField = (value) => {
        if (!value)
            return value;
        const findings = scanForPII(value);
        if (findings.length === 0)
            return value;
        for (const f of findings)
            totalMatches.set(`pii:${f.pattern}`, (totalMatches.get(`pii:${f.pattern}`) ?? 0) + 1);
        return redactPII(value, findings);
    };
    step.prompt = piiRedactField(step.prompt);
    step.output = piiRedactField(step.output);
    step.command = piiRedactField(step.command);
    return { redacted: step, matches: totalMatches };
}
function redactValue(value) {
    const matches = new Map();
    const redactString = (input) => {
        let next = input;
        for (const pattern of secretPatterns) {
            const globalRegex = new RegExp(pattern.regex.source, "g");
            next = next.replace(globalRegex, (found) => {
                if (pattern.entropyThreshold !== undefined && shannonEntropy(found) < pattern.entropyThreshold)
                    return found;
                matches.set(pattern.name, (matches.get(pattern.name) ?? 0) + 1);
                return REDACTION_MARKER;
            });
        }
        return next;
    };
    const walk = (node) => {
        if (typeof node === "string")
            return redactString(node);
        if (Array.isArray(node))
            return node.map((i) => walk(i));
        if (node && typeof node === "object") {
            const out = {};
            for (const [k, v] of Object.entries(node))
                out[k] = walk(v);
            return out;
        }
        return node;
    };
    return { redacted: walk(value), matches };
}
function scanForSecret(value) {
    if (typeof value === "string") {
        for (const pattern of secretPatterns) {
            pattern.regex.lastIndex = 0;
            const match = pattern.regex.exec(value);
            if (!match)
                continue;
            if (pattern.entropyThreshold !== undefined && shannonEntropy(match[0]) < pattern.entropyThreshold)
                continue;
            return pattern.name;
        }
        return null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const f = scanForSecret(item);
            if (f)
                return f;
        }
        return null;
    }
    if (value && typeof value === "object") {
        for (const entry of Object.values(value)) {
            const f = scanForSecret(entry);
            if (f)
                return f;
        }
    }
    return null;
}
function stepToPayloadText(step) {
    return JSON.stringify({ actor: step.actor, type: step.type, prompt: step.prompt, output: step.output, command: step.command, externalUrl: step.externalUrl, toolCall: step.toolCall, metadata: step.metadata }, null, 2);
}
function logAuditEntry(entry) {
    auditLogWriteChain = auditLogWriteChain.catch(() => undefined).then(async () => {
        await mkdir(firewallLogDir, { recursive: true });
        await appendFile(firewallLogPath(), `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    }).catch(() => { });
}
function parseBooleanEnv(value, fallback) {
    if (!value)
        return fallback;
    const n = value.trim().toLowerCase();
    if (n === "1" || n === "true" || n === "yes" || n === "on")
        return true;
    if (n === "0" || n === "false" || n === "no" || n === "off")
        return false;
    return fallback;
}
function parseDefaultAction(value) {
    const n = String(value ?? "allow").trim().toLowerCase();
    if (n === "deny" || n === "log_only")
        return n;
    return "allow";
}
function expandPath(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith("~/"))
        return join(homedir(), trimmed.slice(2));
    return resolvePath(trimmed);
}
function globMatch(value, pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexSource = `^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`;
    return new RegExp(regexSource, "i").test(value);
}
function shannonEntropy(text) {
    if (text.length === 0)
        return 0;
    const freq = new Map();
    for (const char of text)
        freq.set(char, (freq.get(char) ?? 0) + 1);
    let entropy = 0;
    for (const count of freq.values()) {
        const p = count / text.length;
        entropy -= p * Math.log2(p);
    }
    return entropy;
}
//# sourceMappingURL=firewall-policy.js.map