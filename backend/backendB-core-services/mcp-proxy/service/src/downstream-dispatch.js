import { mapleLog } from "@maple/common";
const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * Dispatch a JSON-RPC request to a downstream MCP server via HTTP POST.
 *
 * Takes a target URL and a JSON-RPC request body, makes an HTTP POST,
 * handles timeouts and abort signals, and returns the parsed JSON-RPC response.
 */
export async function dispatchJsonRpc(targetUrl, body, options) {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const headers = {
        "content-type": "application/json",
        accept: "application/json",
        ...options?.headers,
    };
    try {
        mapleLog("debug", "downstream_dispatch_start", {
            targetUrl,
            timeoutMs,
        });
        const response = await fetch(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        const durationMs = Date.now() - startedAt;
        const payload = await response.json().catch(() => undefined);
        if (!response.ok) {
            const preview = payload
                ? JSON.stringify(payload).slice(0, 600)
                : `HTTP ${response.status}`;
            const err = new Error(`Downstream MCP server returned HTTP ${response.status}: ${preview}`);
            err.statusCode = response.status;
            err.durationMs = durationMs;
            mapleLog("error", "downstream_dispatch_http_error", {
                targetUrl,
                status: response.status,
                durationMs,
            });
            throw err;
        }
        // Validate we got a JSON-RPC-shaped response
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
            const rpcBody = payload;
            if (rpcBody.error) {
                const errPreview = JSON.stringify(rpcBody.error).slice(0, 600);
                mapleLog("warn", "downstream_dispatch_rpc_error", {
                    targetUrl,
                    durationMs,
                    error: errPreview,
                });
            }
        }
        mapleLog("debug", "downstream_dispatch_done", {
            targetUrl,
            durationMs,
            status: response.status,
        });
        return payload;
    }
    catch (err) {
        const durationMs = Date.now() - startedAt;
        if (err.name === "AbortError") {
            const timeoutErr = new Error(`Downstream MCP request to ${targetUrl} timed out after ${timeoutMs}ms`);
            timeoutErr.code = "DEADLINE_EXCEEDED";
            timeoutErr.durationMs = durationMs;
            mapleLog("error", "downstream_dispatch_timeout", {
                targetUrl,
                timeoutMs,
                durationMs,
            });
            throw timeoutErr;
        }
        // Re-throw errors that we already created (HTTP errors above)
        if (err.statusCode || err.code === "DEADLINE_EXCEEDED") {
            throw err;
        }
        // Network-level or unexpected errors
        mapleLog("error", "downstream_dispatch_error", {
            targetUrl,
            durationMs,
            error: err.message,
        });
        const networkErr = new Error(`Downstream MCP request to ${targetUrl} failed: ${err.message}`);
        networkErr.code = "NETWORK_ERROR";
        networkErr.durationMs = durationMs;
        throw networkErr;
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=downstream-dispatch.js.map