import {
  dispatchDownstreamChainAndLog,
  resolveDispatchAppIds,
} from "../firewall-proxy.js";

type DownstreamChainResult = Awaited<ReturnType<typeof dispatchDownstreamChainAndLog>>;

export type WidgetDispatchResult =
  | {
      ok: true;
      chainResult: DownstreamChainResult;
      raw: Record<string, unknown> | undefined;
    }
  | {
      ok: false;
      message: string;
    };

// zod v3/v4 compatibility shim — mcp-use internally expects zod v4 types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const zodCompat = <T>(schema: T): any => schema;

export async function dispatchWidgetTool(options: {
  toolName: string;
  toolArgs: Record<string, unknown>;
  failureMessage: string;
}): Promise<WidgetDispatchResult> {
  const appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
  const chainResult = await dispatchDownstreamChainAndLog({
    appIds,
    toolName: options.toolName,
    toolArgs: options.toolArgs,
    sessionId: "chatgpt",
    origin: "mcp",
  });

  if (!chainResult.ok) {
    return {
      ok: false,
      message: chainResult.failure ?? options.failureMessage,
    };
  }

  const raw = chainResult.finalResult.dispatch?.result;
  const rawRecord = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;

  return {
    ok: true,
    chainResult,
    raw: rawRecord,
  };
}
