import { error, object } from "mcp-use/server";
import {
  dispatchDownstreamToolInputSchema,
  listDownstreamAppsInputSchema,
  listDownstreamToolsInputSchema,
} from "../../core/tool-schemas.js";
import type { DownstreamAppConfig, DownstreamAppInfo, DownstreamToolInfo } from "../../control/downstream-proxy.js";
import type { DownstreamChainDispatchResult } from "../orchestration/downstream-orchestration.js";

interface ToolRegistrar {
  tool: (...args: any[]) => unknown;
}

interface ListDownstreamToolsResult {
  requestId?: string;
  durationMs: number;
  tools: DownstreamToolInfo[];
}

interface RegisterDownstreamControlToolsDeps {
  asString: (value: unknown) => string | undefined;
  parseAppIdList: (value: unknown) => string[];
  errorMessage: (error: unknown) => string;
  mcpRouteLockEnabled: boolean;
  listDownstreamAppsFromRegistry: (includeDisabled?: boolean) => DownstreamAppInfo[];
  resolveDownstreamApp: (appId: string) => DownstreamAppConfig;
  listToolsFromDownstreamCached: (app: DownstreamAppConfig) => Promise<ListDownstreamToolsResult>;
  resolveDispatchAppIds: (options: {
    explicitChain?: unknown;
    fallbackAppId?: string;
    includeDefaultExecutionOrder?: boolean;
  }) => string[];
  dispatchDownstreamChainAndLog: (options: {
    appIds: string[];
    toolName: string;
    toolArgs: Record<string, unknown>;
    sessionId: string;
    traceId?: string;
    origin: "mcp";
  }) => Promise<DownstreamChainDispatchResult>;
  toPolicySnapshot: (decision: any) => Record<string, unknown>;
}

export function registerDownstreamControlTools(
  server: ToolRegistrar,
  deps: RegisterDownstreamControlToolsDeps
): void {
  const {
    asString,
    dispatchDownstreamChainAndLog,
    errorMessage,
    listDownstreamAppsFromRegistry,
    listToolsFromDownstreamCached,
    mcpRouteLockEnabled,
    parseAppIdList,
    resolveDispatchAppIds,
    resolveDownstreamApp,
    toPolicySnapshot,
  } = deps;

  server.tool(
    {
      name: "list_downstream_apps",
      description:
        "List downstream MCP apps registered behind Maple. Clients should call Maple only and dispatch via this control plane.",
      schema: listDownstreamAppsInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ includeDisabled }: { includeDisabled: boolean }) => {
      const apps = listDownstreamAppsFromRegistry(includeDisabled);
      return object({
        count: apps.length,
        apps,
      });
    }
  );

  server.tool(
    {
      name: "list_downstream_tools",
      description:
        "List tools exposed by a registered downstream MCP app through Maple proxy routing.",
      schema: listDownstreamToolsInputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ appId }: { appId: string }) => {
      let app: DownstreamAppConfig;
      try {
        app = resolveDownstreamApp(appId);
      } catch (configError) {
        return error(errorMessage(configError));
      }

      try {
        const listed = await listToolsFromDownstreamCached(app);
        return object({
          appId: app.id,
          requestId: listed.requestId,
          durationMs: listed.durationMs,
          toolCount: listed.tools.length,
          tools: listed.tools,
        });
      } catch (listError) {
        return error(`Downstream tools/list failed: ${errorMessage(listError)}`);
      }
    }
  );

  server.tool(
    {
      name: "dispatch_downstream_tool",
      description:
        "Dispatch a tool call to one or more downstream MCP apps via Maple in execution order, then normalize, score, and log outputs into Maple traces.",
      schema: dispatchDownstreamToolInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({
      appId,
      chainAppIds,
      toolName,
      arguments: toolArgs,
      sessionId,
      traceId,
    }: {
      appId?: string;
      chainAppIds?: string[];
      toolName: string;
      arguments: Record<string, unknown>;
      sessionId: string;
      traceId?: string;
    }) => {
      if (mcpRouteLockEnabled) {
        const overrideAttempted = Boolean(asString(appId)) || parseAppIdList(chainAppIds).length > 0;
        if (overrideAttempted) {
          return error(
            "MCP route-lock is enabled. dispatch_downstream_tool rejects appId/chainAppIds overrides; use configured route."
          );
        }
      }

      let appIds: string[];
      try {
        appIds = resolveDispatchAppIds({
          explicitChain: mcpRouteLockEnabled ? undefined : chainAppIds,
          fallbackAppId: mcpRouteLockEnabled ? undefined : appId,
          includeDefaultExecutionOrder: true,
        });
      } catch (resolutionError) {
        return error(errorMessage(resolutionError));
      }

      try {
        const chainResult = await dispatchDownstreamChainAndLog({
          appIds,
          toolName,
          toolArgs,
          sessionId,
          traceId,
          origin: "mcp",
        });
        const result = chainResult.finalResult;

        if (!chainResult.ok) {
          if (chainResult.blockedByPolicy) {
            return error(
              `Policy blocked ${result.app.id}.${toolName} before execution: ${
                result.preExecutionDecision.message
              } trace=${result.trace.id} preExecStep=${result.preExecutionStep.index}`
            );
          }
          return error(
            `${
              result.failure ?? "Downstream dispatch failed."
            } trace=${result.trace.id} step=${result.step.index} preExecStep=${result.preExecutionStep.index}`
          );
        }

        return object({
          appId: result.app.id,
          chainAppIds: chainResult.appIds,
          chainStages: chainResult.stages,
          blocked: false,
          executeAllowed: true,
          blockedByPolicy: false,
          policyWouldBlock: result.preExecutionWouldBlock,
          toolName,
          traceId: result.trace.id,
          sessionId: result.trace.sessionId,
          stepIndex: result.step.index,
          preExecutionStepIndex: result.preExecutionStep.index,
          policy: toPolicySnapshot(result.preExecutionDecision),
          overallRiskScore: result.report.overallRiskScore,
          severity: result.report.severity,
          dispatch: {
            requestId: result.dispatch?.requestId,
            responseStatus: result.dispatch?.responseStatus,
            durationMs: result.dispatch?.durationMs,
          },
          resultPreview: result.dispatch?.textPreview,
          result: result.dispatch?.result,
        });
      } catch (dispatchError) {
        return error(`Downstream dispatch could not be completed: ${errorMessage(dispatchError)}`);
      }
    }
  );
}
