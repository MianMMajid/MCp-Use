import { server, database } from "../state.js";
import { allowNoAuth } from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import { handleMcpFirewallProxy } from "../firewall-proxy.js";
// ── Accept Header Fix for MCP/SSE Endpoints ─────────────────────────────────
// Force correct Accept header for MCP/SSE endpoints so the mcp-use framework
// doesn't misidentify programmatic MCP clients (e.g. ChatGPT) as browsers
// and return HTML instead of an SSE event stream.
// Per the MCP Streamable HTTP spec, GET /mcp MUST return text/event-stream, never HTML.
for (const mcpEndpoint of ["/mcp", "/sse"]) {
    server.app.use(mcpEndpoint, async (c, next) => {
        if (c.req.method === "GET") {
            // Unconditionally force Accept to text/event-stream for ALL GET requests.
            // MCP spec says GET returns SSE; HTML landing pages break ChatGPT connectors.
            try {
                c.req.raw.headers.set("Accept", "text/event-stream");
            }
            catch {
                // Headers may be immutable in some runtimes; replace the Request object.
                try {
                    const newHeaders = new Headers();
                    for (const [key, value] of c.req.raw.headers.entries()) {
                        if (key.toLowerCase() !== "accept") {
                            newHeaders.append(key, value);
                        }
                    }
                    newHeaders.set("Accept", "text/event-stream");
                    c.req.raw = new Request(c.req.raw.url, {
                        method: c.req.raw.method,
                        headers: newHeaders,
                    });
                }
                catch {
                    // Last resort: fall through, response interceptor below will catch HTML
                }
            }
        }
        await next();
        // Fallback: if the response is STILL HTML despite header overrides
        // (e.g. the framework cached the Accept header), replace with proper error.
        const ct = c.res?.headers?.get("content-type") || "";
        if (ct.includes("text/html")) {
            c.res = new Response(JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Bad Request: Server not initialized" },
                id: null,
            }), {
                status: 400,
                headers: {
                    "content-type": "application/json",
                    "access-control-allow-origin": "*",
                    "access-control-allow-methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
                    "access-control-allow-headers": "Content-Type, Accept, Authorization, mcp-protocol-version, mcp-session-id",
                    "access-control-expose-headers": "mcp-session-id",
                },
            });
        }
    });
}
// ── Auth Middleware for /mcp ─────────────────────────────────────────────────
server.app.use("/mcp", async (c, next) => {
    const unauthorized = await requireApiKeyResponse(c, database, { allowSession: false, requireApiKey: !allowNoAuth });
    if (unauthorized) {
        return unauthorized;
    }
    if (c.req.method === "POST") {
        const proxied = await handleMcpFirewallProxy(c);
        if (proxied) {
            return proxied;
        }
    }
    await next();
});
// ── Auth Middleware for /sse ─────────────────────────────────────────────────
server.app.use("/sse", async (c, next) => {
    const unauthorized = await requireApiKeyResponse(c, database, { allowSession: false, requireApiKey: !allowNoAuth });
    if (unauthorized) {
        return unauthorized;
    }
    await next();
});
//# sourceMappingURL=mcp-middleware.js.map