import { readJsonBody, errorMessage } from "../helpers.js";
import { resolveDispatchAppIds, dispatchDownstreamChainAndLog, } from "../firewall-proxy.js";
import { verifyGptAccessToken } from "./gpt-adapter-oauth-routes.js";
export function registerGptToolDispatchRoute(app) {
    app.post("/gpt/tools/:toolName", async (c) => {
        // ── Bearer token verification ─────────────────────────────────────
        const authHeader = c.req.header("authorization") ?? "";
        const bearerToken = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : undefined;
        if (!bearerToken || !verifyGptAccessToken(bearerToken)) {
            return c.json({ ok: false, error: "Unauthorized: missing or invalid bearer token." }, 401);
        }

        const toolName = c.req.param("toolName");
        if (!toolName) {
            return c.json({ ok: false, error: "Tool name is required." }, 400);
        }
        const body = await readJsonBody(c);
        const toolArgs = {};
        for (const [key, value] of Object.entries(body)) {
            toolArgs[key] = value;
        }
        let appIds;
        try {
            appIds = resolveDispatchAppIds({ includeDefaultExecutionOrder: true });
        }
        catch (resolutionError) {
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
                return c.json({
                    ok: false,
                    error: result.failure ?? "Tool dispatch failed.",
                }, chainResult.blockedByPolicy ? 403 : 502);
            }
            const textPreview = result.dispatch?.textPreview ?? "";
            const rawResult = result.dispatch?.result;
            const structuredData = rawResult?.structuredContent?.data ?? null;
            return c.json({
                ok: true,
                result: textPreview,
                ...(structuredData ? { data: structuredData } : {}),
            });
        }
        catch (dispatchError) {
            return c.json({ ok: false, error: errorMessage(dispatchError) }, 500);
        }
    });
}
//# sourceMappingURL=gpt-adapter-tool-route.js.map