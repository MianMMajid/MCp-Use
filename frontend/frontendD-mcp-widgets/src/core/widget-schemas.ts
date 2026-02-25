/**
 * Widget prop type definitions.
 * Mirrors the backend runtime schema surface
 * (backend/backendB-core-services/gateway-api/service/src/core/widget-schemas.js).
 *
 * These are kept as plain TypeScript interfaces so the widget package
 * does not depend on Zod at runtime.
 */

export type Severity = "low" | "medium" | "high" | "critical";
export type GuardAction = "allow" | "block" | "pending";

export interface RiskFlag {
  id: string;
  type: string;
  severity: Severity;
  stepIndex: number;
  message: string;
  recommendation: string;
  evidence?: string;
}

export interface TimelineStep {
  index: number;
  timestamp: string;
  actor: string;
  type: string;
  summary: string;
  riskScore: number;
  guardStatus: GuardAction;
  flags: RiskFlag[];
}

export interface TimelineWidgetProps {
  traceId: string;
  sessionId: string;
  source: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  overallRiskScore: number;
  flaggedSteps: number;
  quarantined: boolean;
  steps: TimelineStep[];
}

export interface ReplayChange {
  stepIndex: number;
  field: string;
  before?: string;
  after?: string;
}

export interface ReplaySimulatorProps {
  originalTraceId: string;
  forkedTraceId: string;
  forkStepIndex: number;
  edits: Record<string, unknown>;
  changedSteps: number[];
  addedSteps: number[];
  changeLog: ReplayChange[];
  originalSteps: TimelineStep[];
  forkedSteps: TimelineStep[];
}

export interface RiskDashboardProps {
  traceId: string;
  status: string;
  overallRiskScore: number;
  severity: Severity;
  breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recommendations: string[];
  flags: RiskFlag[];
}

export interface SearchResultItem {
  title: string;
  url?: string;
  snippet?: string;
  source?: string;
}

export interface SearchResultsWidgetProps {
  query: string;
  results: SearchResultItem[];
  totalResults?: number;
  source?: string;
}

export interface WeatherForecastDay {
  date?: string;
  condition: string;
  tempHigh?: number;
  tempLow?: number;
  temp?: number;
  humidity?: number;
  wind?: string;
  icon?: string;
}

export interface WeatherCardWidgetProps {
  location: string;
  unit?: string;
  current?: WeatherForecastDay;
  forecast?: WeatherForecastDay[];
}

export interface GithubCardWidgetProps {
  name: string;
  fullName?: string;
  description?: string;
  url?: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
  language?: string;
  license?: string;
  updatedAt?: string;
  owner?: string;
  topics?: string[];
}

export interface WikiCardWidgetProps {
  title: string;
  summary: string;
  url?: string;
  thumbnail?: string;
  extract?: string;
}

export interface ArxivPaper {
  title: string;
  authors?: string[];
  summary?: string;
  url?: string;
  published?: string;
  categories?: string[];
}

export interface ArxivResultsWidgetProps {
  query: string;
  results: ArxivPaper[];
  totalResults?: number;
}

export interface BookItem {
  title: string;
  authors?: string[];
  firstPublishYear?: number;
  coverUrl?: string;
  isbn?: string;
  publisher?: string;
  url?: string;
}

export interface BookResultsWidgetProps {
  query: string;
  results: BookItem[];
  totalResults?: number;
}

export interface AnomalyFlag {
  metric: string;
  observed: number;
  baseline: number;
  zScore: number;
  severity: Severity;
  description?: string;
}

export interface AnomalyReportWidgetProps {
  traceId: string;
  sessionId?: string;
  overallAnomalyScore: number;
  communityBaseline?: {
    meanRisk: number;
    stdRisk: number;
    sampleSize: number;
  };
  anomalies: AnomalyFlag[];
  summary?: string;
}

export interface GuardActionWidgetProps {
  traceId: string;
  stepIndex: number;
  action: GuardAction;
  stepType?: string;
  stepSummary?: string;
  reason?: string;
  quarantined?: boolean;
  updatedStatus?: string;
}

export interface TraceSummaryItem {
  traceId: string;
  sessionId?: string;
  source?: string;
  status?: string;
  overallRiskScore?: number;
  severity?: Severity;
  stepCount?: number;
  updatedAt?: string;
}

export interface TraceListWidgetProps {
  traces: TraceSummaryItem[];
  totalCount?: number;
}

export interface TraceExportWidgetProps {
  traceId: string;
  format: "json" | "markdown";
  content: string;
  stepCount?: number;
  exportedAt?: string;
}

export interface EvolvedSkill {
  label: string;
  confidence: number;
  source?: string;
  description?: string;
}

export interface EvolvedSkillsWidgetProps {
  query: string;
  skills: EvolvedSkill[];
  communityPoolSize?: number;
}

export interface ShareConfirmationWidgetProps {
  traceId: string;
  sharedId?: string;
  behaviorSignature?: string;
  communityStats?: {
    totalShared: number;
    uniqueSignatures: number;
  };
  previewSuggestions?: string[];
}
