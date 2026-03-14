/**
 * Safe-Redirect Routes
 *
 * GET /api/redirect?url=<encoded>
 * Validates URLs via context-wall policy evaluation before redirecting. Blocks unsafe URLs.
 */
import { Hono } from "hono";
import { getGrpcClients } from "../state.js";
import { grpcUnary } from "../grpc-clients.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog, requestContextStorage } from "../logging.js";
import { authContextStorage } from "../auth.js";
import { resolveVerifiedTenantScope } from "../core/tenant-claim-resolver.js";
export const redirectRoutes = new Hono();
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
redirectRoutes.get("/api/redirect", async (c) => {
    const url = c.req.query("url");
    if (!url) {
        return c.json({ error: "Missing url parameter" }, 400);
    }
    let decoded;
    try {
        decoded = decodeURIComponent(url);
        new URL(decoded); // validate
    }
    catch {
        return c.json({ error: "Invalid URL" }, 400);
    }
    const clients = getGrpcClients();
    if (!clients?.contextWall) {
        // No context-wall available — block by default
        return c.json({ error: "URL validation service unavailable" }, 503);
    }
    try {
        const authContext = authContextStorage.getStore();
        const requestContext = requestContextStorage.getStore();
        // Use verified scope for tenantId — do not trust raw headers
        const scope = await resolveVerifiedTenantScope({
            tenantId: c.req.header("x-tenant-id") ?? requestContext?.tenantId ?? "",
            orgId: c.req.header("x-org-id") ?? "",
            tenantClaimSignature: c.req.header("x-maple-tenant-claim") ?? "",
        });
        const tenantId = scope.verified ? scope.tenantId : (requestContext?.tenantId ?? "default");
        // Use auth context for userId — do not trust x-user-id header
        const userId = authContext?.userId ??
            authContext?.keyFingerprint ??
            "anonymous";
        const deviceId = c.req.header("x-device-id") ??
            requestContext?.deviceId ??
            c.req.header("user-agent") ??
            "unknown-device";
        const policyResult = await grpcUnary(clients.contextWall, "evaluateStep", {
            context: {
                requestId: requestContext?.requestId ?? "",
                sessionId: requestContext?.sessionId ?? "",
                traceId: requestContext?.traceId ?? "",
                userId,
                keyFingerprint: authContext?.keyFingerprint ?? "",
                sourceService: "gateway-api",
                tenantId,
                deviceId,
            },
            step: {
                index: 0,
                timestamp: new Date().toISOString(),
                actor: "STEP_ACTOR_AGENT",
                type: "STEP_TYPE_NETWORK",
                prompt: "safe_redirect",
                output: "",
                command: "",
                externalUrl: decoded,
                riskScore: 0,
                guardStatus: "GUARD_ACTION_PENDING",
            },
        });
        const decision = policyResult?.decision;
        const blocked = decision?.action === "FIREWALL_ACTION_DENY" ||
            decision?.action === "FIREWALL_ACTION_UNSPECIFIED";
        const reason = String(decision?.message || "Blocked by policy.");
        if (!blocked) {
            emitAuditEvent({
                eventType: "AUDIT_EVENT_TYPE_URL_CHECKED",
                sourceService: "gateway-api",
                summary: `Safe redirect to ${decoded}`,
                payload: { url: decoded },
            });
            return c.redirect(decoded, 302);
        }
        emitAuditEvent({
            eventType: "AUDIT_EVENT_TYPE_URL_BLOCKED",
            sourceService: "gateway-api",
            summary: `Blocked redirect to ${decoded}: ${reason}`,
            severity: "RISK_SEVERITY_HIGH",
            payload: { url: decoded, reason },
        });
        const warningHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>URL Blocked - Maple Firewall</title></head>
<body>
  <h1>URL Blocked</h1>
  <p>The URL <code>${escapeHtml(decoded)}</code> was blocked by Maple Firewall.</p>
  <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
  <p><a href="/">Return to dashboard</a></p>
</body>
</html>`;
        return new Response(warningHtml, {
            status: 403,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }
    catch (err) {
        mapleLog("error", "redirect_check_failed", { url: decoded, error: err.message });
        return c.json({ error: "URL validation failed" }, 500);
    }
});
//# sourceMappingURL=redirect-routes.js.map