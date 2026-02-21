import { z } from "zod";

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);
export const guardActionSchema = z.enum(["allow", "block", "pending"]);

export const riskFlagSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: severitySchema,
  stepIndex: z.number().int().nonnegative(),
  message: z.string(),
  recommendation: z.string(),
  evidence: z.string().optional(),
});

export const timelineStepSchema = z.object({
  index: z.number().int().nonnegative(),
  timestamp: z.string(),
  actor: z.string(),
  type: z.string(),
  summary: z.string(),
  riskScore: z.number().min(0).max(100),
  guardStatus: guardActionSchema,
  flags: z.array(riskFlagSchema),
});

export const timelineWidgetPropsSchema = z.object({
  traceId: z.string(),
  sessionId: z.string(),
  source: z.string(),
  status: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  overallRiskScore: z.number().min(0).max(100),
  flaggedSteps: z.number().int().nonnegative(),
  quarantined: z.boolean(),
  steps: z.array(timelineStepSchema),
});

export const replayChangeSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  field: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
});

export const replaySimulatorPropsSchema = z.object({
  originalTraceId: z.string(),
  forkedTraceId: z.string(),
  forkStepIndex: z.number().int().nonnegative(),
  edits: z.record(z.string(), z.unknown()).default({}),
  changedSteps: z.array(z.number().int().nonnegative()),
  addedSteps: z.array(z.number().int().nonnegative()),
  changeLog: z.array(replayChangeSchema),
  originalSteps: z.array(timelineStepSchema),
  forkedSteps: z.array(timelineStepSchema),
});

export const riskDashboardPropsSchema = z.object({
  traceId: z.string(),
  status: z.string(),
  overallRiskScore: z.number().min(0).max(100),
  severity: severitySchema,
  breakdown: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  recommendations: z.array(z.string()),
  flags: z.array(riskFlagSchema),
});

export type TimelineWidgetProps = z.infer<typeof timelineWidgetPropsSchema>;
export type ReplaySimulatorProps = z.infer<typeof replaySimulatorPropsSchema>;
export type RiskDashboardProps = z.infer<typeof riskDashboardPropsSchema>;
