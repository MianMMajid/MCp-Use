import { z } from "zod";
import { guardActionSchema, severitySchema } from "./widget-schemas.js";
export const observeSessionInputSchema = z.object({
    sessionId: z.string().min(1).describe("Agent session identifier"),
    source: z
        .enum(["openclaw"])
        .default("openclaw")
        .describe("Observation source"),
    bridgeUrl: z
        .string()
        .url()
        .optional()
        .describe("Optional OpenClaw bridge URL override"),
    token: z
        .string()
        .optional()
        .describe("Optional bridge token override for this request"),
    reuseLatest: z
        .boolean()
        .default(true)
        .describe("Reuse latest trace for this session when available"),
});
export const replayForkInputSchema = z.object({
    traceId: z.string().min(1),
    forkStepIndex: z.number().int().nonnegative(),
    edits: z
        .object({
        prompt: z.string().optional(),
        output: z.string().optional(),
        command: z.string().optional(),
        toolName: z.string().optional(),
        toolResponse: z.string().optional(),
        appendSimulationNote: z.string().optional(),
    })
        .default({}),
});
export const auditRiskInputSchema = z.object({
    traceId: z.string().min(1),
    topFlags: z
        .number()
        .int()
        .positive()
        .max(50)
        .default(8)
        .describe("How many flags to include in the response"),
});
export const guardActionInputSchema = z.object({
    traceId: z.string().min(1),
    stepIndex: z.number().int().nonnegative(),
    action: guardActionSchema.describe("allow, block, or pending"),
    reason: z.string().optional(),
});
export const listTracesInputSchema = z.object({
    limit: z.number().int().positive().max(100).default(20),
    sessionId: z.string().optional(),
});
export const exportTraceInputSchema = z.object({
    traceId: z.string().min(1),
    format: z.enum(["json", "markdown"]).default("json"),
});
export const mlAnomalyReportInputSchema = z.object({
    traceId: z.string().min(1),
    useCommunityBaseline: z.boolean().default(true),
    threshold: z.number().min(0).max(1).default(0.58),
    topAnomalies: z.number().int().positive().max(20).default(5),
});
export const shareTraceAnonInputSchema = z.object({
    traceId: z.string().min(1),
    taskLabel: z.string().optional(),
    objective: z.string().optional(),
    tags: z.array(z.string()).default([]),
});
export const suggestEvolvedSkillsInputSchema = z.object({
    query: z.string().min(3),
    limit: z.number().int().positive().max(10).default(3),
    minConfidence: z.number().min(0).max(1).default(0.4),
});
export const ycAppBriefInputSchema = z.object({
    focus: z.enum(["full", "moat", "traction", "revenue"]).default("full"),
});
export const listDownstreamAppsInputSchema = z.object({
    includeDisabled: z.boolean().default(false),
});
export const listDownstreamToolsInputSchema = z.object({
    appId: z.string().min(1),
});
export const dispatchDownstreamToolInputSchema = z.object({
    appId: z.string().min(1).optional(),
    chainAppIds: z.array(z.string().min(1)).optional(),
    toolName: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).default({}),
    sessionId: z.string().default("maple-control"),
    traceId: z.string().optional(),
});
export const observeSessionOutputSchema = z.object({
    traceId: z.string(),
    sessionId: z.string(),
    source: z.string(),
    stepCount: z.number().int().nonnegative(),
    overallRiskScore: z.number().min(0).max(100),
    severity: severitySchema,
    status: z.string(),
});
export const replayForkOutputSchema = z.object({
    originalTraceId: z.string(),
    forkedTraceId: z.string(),
    forkStepIndex: z.number().int().nonnegative(),
    changedSteps: z.array(z.number().int().nonnegative()),
    addedSteps: z.array(z.number().int().nonnegative()),
    status: z.string(),
});
export const auditRiskOutputSchema = z.object({
    traceId: z.string(),
    overallRiskScore: z.number().min(0).max(100),
    severity: severitySchema,
    flagCount: z.number().int().nonnegative(),
    status: z.string(),
});
export const guardActionOutputSchema = z.object({
    traceId: z.string(),
    stepIndex: z.number().int().nonnegative(),
    action: guardActionSchema,
    status: z.string(),
    quarantined: z.boolean(),
});
//# sourceMappingURL=tool-schemas.js.map