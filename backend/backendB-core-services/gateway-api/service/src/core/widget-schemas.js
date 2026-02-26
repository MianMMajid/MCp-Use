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
export const replayReviewPropsSchema = z.object({
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
// ── Downstream tool widget schemas ──────────────────────────────────
export const searchResultItemSchema = z.object({
    title: z.string(),
    url: z.string().optional(),
    snippet: z.string().optional(),
    source: z.string().optional(),
});
export const searchResultsWidgetPropsSchema = z.object({
    query: z.string(),
    results: z.array(searchResultItemSchema),
    totalResults: z.number().optional(),
    source: z.string().optional(),
});
export const weatherForecastDaySchema = z.object({
    date: z.string().optional(),
    condition: z.string(),
    tempHigh: z.number().optional(),
    tempLow: z.number().optional(),
    temp: z.number().optional(),
    humidity: z.number().optional(),
    wind: z.string().optional(),
    icon: z.string().optional(),
});
export const weatherCardWidgetPropsSchema = z.object({
    location: z.string(),
    unit: z.string().optional(),
    current: weatherForecastDaySchema.optional(),
    forecast: z.array(weatherForecastDaySchema).optional(),
});
export const githubCardWidgetPropsSchema = z.object({
    name: z.string(),
    fullName: z.string().optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    stars: z.number().optional(),
    forks: z.number().optional(),
    openIssues: z.number().optional(),
    language: z.string().optional(),
    license: z.string().optional(),
    updatedAt: z.string().optional(),
    owner: z.string().optional(),
    topics: z.array(z.string()).optional(),
});
export const wikiCardWidgetPropsSchema = z.object({
    title: z.string(),
    summary: z.string(),
    url: z.string().optional(),
    thumbnail: z.string().optional(),
    extract: z.string().optional(),
});
export const arxivPaperSchema = z.object({
    title: z.string(),
    authors: z.array(z.string()).optional(),
    summary: z.string().optional(),
    url: z.string().optional(),
    published: z.string().optional(),
    categories: z.array(z.string()).optional(),
});
export const arxivResultsWidgetPropsSchema = z.object({
    query: z.string(),
    results: z.array(arxivPaperSchema),
    totalResults: z.number().optional(),
});
export const bookItemSchema = z.object({
    title: z.string(),
    authors: z.array(z.string()).optional(),
    firstPublishYear: z.number().optional(),
    coverUrl: z.string().optional(),
    isbn: z.string().optional(),
    publisher: z.string().optional(),
    url: z.string().optional(),
});
export const bookResultsWidgetPropsSchema = z.object({
    query: z.string(),
    results: z.array(bookItemSchema),
    totalResults: z.number().optional(),
});
//# sourceMappingURL=widget-schemas.js.map
