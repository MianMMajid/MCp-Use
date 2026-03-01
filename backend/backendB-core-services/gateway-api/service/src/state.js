import { MCPServer } from "mcp-use/server";
import { TraceStore } from "./core/trace-store.js";
import { SharedTraceStore } from "./network/shared-trace-store.js";
import { MaplePostgresDatabase, } from "@maple/persistence";
import { listDownstreamApps, } from "./control/downstream-proxy.js";
import { downstreamAppRegistry, mcpExecutionOrderAppIds, mcpFirewallDefaultAppId, mcpProxyDefaultTargetUrl, mcpProxyAllowDynamicTargets, mcpProxyAllowPrivateTargets, mcpProxyAllowedHosts, mcpRouteLockEnabled, } from "./config.js";
// ── Server ──────────────────────────────────────────────────────────────────
export const server = new MCPServer({
    name: "maple",
    title: "Maple",
    version: "1.0.0",
    description: "Unified MCP control plane for agent observability, replay/forking, risk auditing, and guardrails.",
    baseUrl: (() => { if (!process.env.MCP_URL) throw new Error("Missing required environment variable: MCP_URL"); return process.env.MCP_URL; })(),
    favicon: "favicon.ico",
    websiteUrl: "https://github.com/mcp-use/mcp-use",
    icons: [
        {
            src: "icon.svg",
            mimeType: "image/svg+xml",
            sizes: ["512x512"],
        },
    ],
});
// ── Database & Stores ───────────────────────────────────────────────────────
export const database = new MaplePostgresDatabase();
export const traceStore = new TraceStore({
    persistence: {
        loadTraces: () => database.loadTraces(10_000),
        saveTrace: (trace) => database.upsertTrace(trace),
        removeTrace: (traceId) => database.removeTrace(traceId),
    },
});
export const sharedTraceStore = new SharedTraceStore(undefined, {
    loadSharedTraces: () => database.loadSharedTraces(10_000),
    saveSharedTrace: (trace) => database.upsertSharedTrace(trace),
    removeSharedTrace: (traceId) => database.removeSharedTrace(traceId),
});
export function assertGatewayStartupPolicy() {
    // No-op: gateway startup is strictly fail-closed for persistence.
}
// ── Database Initialization ─────────────────────────────────────────────────
export async function initializeDatabase() {
    try {
        await database.initialize();
        await traceStore.init();
        await sharedTraceStore.init();
        console.log("[DB] PostgreSQL initialized and data loaded.");
    }
    catch (err) {
        console.error("[DB] PostgreSQL initialization failed:", err);
        throw err;
    }
}
export function buildRuntimeStatus() {
    const activeDownstreamApps = listDownstreamApps(downstreamAppRegistry, false);
    const activeDownstreamIds = activeDownstreamApps.map((app) => app.id);
    const singleActiveAppId = activeDownstreamApps.length === 1 ? activeDownstreamApps[0]?.id : undefined;
    let routeMode = "none";
    let routeSummary = "none";
    if (mcpExecutionOrderAppIds.length > 0) {
        routeMode = "execution_order";
        routeSummary = `execution_order:${mcpExecutionOrderAppIds.join("->")}`;
    }
    else if (mcpFirewallDefaultAppId) {
        routeMode = "default_app";
        routeSummary = `default_app:${mcpFirewallDefaultAppId}`;
    }
    else if (mcpProxyDefaultTargetUrl) {
        routeMode = "default_target";
        routeSummary = `default_target:${mcpProxyDefaultTargetUrl}`;
    }
    else if (singleActiveAppId) {
        routeMode = "single_app";
        routeSummary = `single_app:${singleActiveAppId}`;
    }
    return {
        strict: true,
        routeLock: mcpRouteLockEnabled,
        routeMode,
        routeSummary,
        bypassAllowed: false,
        executionOrder: [...mcpExecutionOrderAppIds],
        defaultAppId: mcpFirewallDefaultAppId ?? null,
        defaultTargetUrl: mcpProxyDefaultTargetUrl ?? null,
        dynamicTargetsAllowed: mcpProxyAllowDynamicTargets,
        privateTargetsAllowed: mcpProxyAllowPrivateTargets,
        allowedHosts: [...mcpProxyAllowedHosts],
        activeDownstreamCount: activeDownstreamApps.length,
        activeDownstreamIds,
        activeDownstreamApps,
    };
}
// ── gRPC Clients ──────────────────────────────────────────────────────────
let _grpcClients;
export function setGrpcClients(clients) {
    _grpcClients = clients;
}
export function getGrpcClients() {
    return _grpcClients;
}
//# sourceMappingURL=state.js.map
