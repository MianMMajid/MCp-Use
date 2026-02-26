import { GPT_OAUTH_CLIENT_ID, GPT_OAUTH_CLIENT_SECRET, configuredApiKeys, } from "../config.js";
import { asString, readJsonBody } from "../helpers.js";
import { gptAdapterBaseUrl } from "./gpt-adapter-common.js";
export function registerGptOAuthRoutes(app) {
    app.get("/.well-known/oauth-authorization-server", async (c) => {
        const baseUrl = gptAdapterBaseUrl();
        return c.json({
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/gpt/oauth/authorize`,
            token_endpoint: `${baseUrl}/gpt/oauth/token`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
            code_challenge_methods_supported: ["S256"],
        });
    });
    app.get("/.well-known/oauth-protected-resource", async (c) => {
        const baseUrl = gptAdapterBaseUrl();
        return c.json({
            resource: `${baseUrl}/mcp`,
            authorization_servers: [baseUrl],
            bearer_methods_supported: ["header"],
        });
    });
    app.get("/gpt/oauth/authorize", async (c) => {
        const redirectUri = asString(c.req.query("redirect_uri"));
        const state = asString(c.req.query("state")) ?? "";
        if (!redirectUri) {
            return c.json({ error: "redirect_uri is required" }, 400);
        }
        const code = "maple-auth-code-" + Date.now();
        const separator = redirectUri.includes("?") ? "&" : "?";
        return c.redirect(`${redirectUri}${separator}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    });
    app.post("/gpt/oauth/token", async (c) => {
        const body = await readJsonBody(c);
        const contentType = c.req.header("content-type") ?? "";
        let clientId = asString(body.client_id);
        let clientSecret = asString(body.client_secret);
        if (!clientId && contentType.includes("application/x-www-form-urlencoded")) {
            try {
                const text = await c.req.text();
                const params = new URLSearchParams(text);
                clientId = params.get("client_id") ?? undefined;
                clientSecret = params.get("client_secret") ?? undefined;
            }
            catch (_e) {
                // Ignore malformed form bodies.
            }
        }
        if (clientId && clientId !== GPT_OAUTH_CLIENT_ID) {
            return c.json({ error: "invalid_client" }, 401);
        }
        if (clientSecret && clientSecret !== GPT_OAUTH_CLIENT_SECRET) {
            return c.json({ error: "invalid_client" }, 401);
        }
        const accessToken = configuredApiKeys[0] || "maple-access-token";
        return c.json({
            access_token: accessToken,
            token_type: "bearer",
            expires_in: 86400,
        });
    });
}
//# sourceMappingURL=gpt-adapter-oauth-routes.js.map