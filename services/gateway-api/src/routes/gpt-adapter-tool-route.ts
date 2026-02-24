import { server } from "../state.js";
import { readJsonBody, errorMessage } from "../helpers.js";
import {
  resolveDispatchAppIds,
  dispatchDownstreamChainAndLog,
} from "../firewall-proxy.js";

export function registerGptToolDispatchRoute(app: typeof server.app) {
  app.post("/gpt/tools/:toolName", async (c) => {
    const toolName = c.req.param("toolName");
    if (!toolName) {
      return c.json({ ok: false, error: "Tool name is required." }, 400);
    }

    const body = await readJsonBody(c);
    const toolArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      toolArgs[key] = value;
    }

    let appIds: string[];
    try {
      appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
    } catch (resolutionError) {
      return c.json({ ok: false, error: errorMessage(resolutionError) }, 400);
    }

    try {
      const chainResult = await dispatchDownstreamChainAndLog({
        appIds,
        toolName,
        toolArgs,
        sessionId: "gpt-actions",
        origin: "api",
      });
      const result = chainResult.finalResult;

      if (!chainResult.ok) {
        return c.json(
          {
            ok: false,
            error: result.failure ?? "Tool dispatch failed.",
          },
          chainResult.blockedByPolicy ? 403 : 502,
        );
      }

      const textPreview = result.dispatch?.textPreview ?? "";
      const rawResult = result.dispatch?.result as Record<string, unknown> | undefined;
      const structuredData = (rawResult?.structuredContent as Record<string, unknown> | undefined)?.data ?? null;

      return c.json({
        ok: true,
        result: textPreview,
        ...(structuredData ? { data: structuredData } : {}),
      });
    } catch (dispatchError) {
      return c.json({ ok: false, error: errorMessage(dispatchError) }, 500);
    }
  });
}
