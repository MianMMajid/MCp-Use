import { createHash } from "node:crypto";
import { asString } from "@maple/common";
import { readJsonBody } from "../helpers.js";
import { findRequestSession } from "../auth.js";
import {
  buildIntegrationOAuthStartResponse,
  decryptIntegrationOAuthTokenBundle,
  encryptIntegrationOAuthTokenBundle,
  exchangeIntegrationOAuthCode,
  fetchIntegrationOAuthAccountProfile,
  parseIntegrationOAuthStateToken,
  refreshIntegrationOAuthToken,
  resolveIntegrationOAuthAvailability,
  revokeIntegrationOAuthToken,
} from "../core/integration-oauth.js";
import {
  completeCliBrowserFlow,
  createCliBrowserFlow,
  failCliBrowserFlow,
  getCliBrowserFlow,
  serializeCliBrowserFlow,
} from "../core/cli-browser-flow-store.js";

const INTEGRATION_CATALOG = [
  { id: "google-workspace", name: "Google Workspace", defaultAuthType: "oauth2" },
  { id: "slack", name: "Slack", defaultAuthType: "oauth2" },
  { id: "notion", name: "Notion", defaultAuthType: "oauth2" },
  { id: "github", name: "GitHub", defaultAuthType: "oauth2" },
  { id: "jira", name: "Jira", defaultAuthType: "oauth2" },
  { id: "linear", name: "Linear", defaultAuthType: "oauth2" },
  { id: "salesforce", name: "Salesforce", defaultAuthType: "oauth2" },
  { id: "hubspot", name: "HubSpot", defaultAuthType: "oauth2" },
  { id: "postgres", name: "PostgreSQL", defaultAuthType: "token" },
  { id: "stripe", name: "Stripe", defaultAuthType: "token" },
  { id: "twilio", name: "Twilio", defaultAuthType: "token" },
  { id: "sendgrid", name: "SendGrid", defaultAuthType: "token" },
  { id: "openai", name: "OpenAI", defaultAuthType: "token" },
  { id: "anthropic", name: "Anthropic", defaultAuthType: "token" },
  { id: "browser", name: "Web Browser", defaultAuthType: "internal" },
  { id: "filesystem", name: "Filesystem", defaultAuthType: "internal" },
];

const catalogById = new Map(INTEGRATION_CATALOG.map((entry) => [entry.id, entry]));

function normalizeProvider(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function parseScopes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asString(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, 64);
}

function credentialFingerprint(secret) {
  const normalized = asString(secret);
  if (!normalized) {
    return "";
  }
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function sanitizeMetadataForApi(metadataInput) {
  const metadata =
    metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput)
      ? { ...metadataInput }
      : {};
  if (metadata.oauth && typeof metadata.oauth === "object") {
    const oauth = metadata.oauth;
    metadata.oauth = {
      provider: asString(oauth.provider),
      tokenType: asString(oauth.tokenType),
      hasRefreshToken: Boolean(oauth.hasRefreshToken),
      scope: Array.isArray(oauth.scope) ? oauth.scope : [],
      connectedAt: asString(oauth.connectedAt),
      updatedAt: asString(oauth.updatedAt),
      expiresAt: asString(oauth.expiresAt),
      lastRefreshAt: asString(oauth.lastRefreshAt),
      revokedAt: asString(oauth.revokedAt),
      revokeResult: oauth.revokeResult && typeof oauth.revokeResult === "object"
        ? oauth.revokeResult
        : {},
    };
  }
  return metadata;
}

function toApiIntegration(record, definition) {
  const normalized = record ?? {};
  const provider = asString(normalized.provider) || definition?.id || "";
  const displayName =
    asString(normalized.displayName) ||
    asString(normalized.display_name) ||
    definition?.name ||
    provider;
  const status = asString(normalized.status) || "disconnected";
  const authType =
    asString(normalized.authType) ||
    asString(normalized.auth_type) ||
    definition?.defaultAuthType ||
    "none";
  return {
    id: asString(normalized.id),
    provider,
    displayName,
    status,
    connected: status === "connected",
    authType,
    externalAccountId:
      asString(normalized.externalAccountId) ||
      asString(normalized.external_account_id),
    scopes: Array.isArray(normalized.scopes) ? normalized.scopes : [],
    metadata:
      normalized.metadata && typeof normalized.metadata === "object"
        ? sanitizeMetadataForApi(normalized.metadata)
        : {},
    connectedAt: asString(normalized.connectedAt) || asString(normalized.connected_at),
    disconnectedAt:
      asString(normalized.disconnectedAt) || asString(normalized.disconnected_at),
    updatedAt: asString(normalized.updatedAt) || asString(normalized.updated_at),
  };
}

async function requireSession(c, database) {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) {
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

function ensureIntegrationMethods(database) {
  if (
    typeof database.listUserIntegrations !== "function" ||
    typeof database.findUserIntegration !== "function" ||
    typeof database.upsertUserIntegration !== "function" ||
    typeof database.disconnectUserIntegration !== "function"
  ) {
    throw new Error(
      "Integration persistence methods are unavailable on the configured database."
    );
  }
}

function parseRedirectToggle(rawValue) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function requestContextFromHeaders(c) {
  return {
    traceId: c.req.header("x-trace-id") ?? "",
    requestId: c.req.header("x-request-id") ?? "",
    tenantId: c.req.header("x-maple-tenant-id") ?? "",
    userId: c.req.header("x-maple-user-id") ?? "",
    deviceId: c.req.header("x-maple-device-id") ?? "",
    sessionId: c.req.header("x-maple-session-id") ?? "",
  };
}

function safeReturnToPath(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "/#auth";
  }
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/#auth";
  }
  if (normalized.includes("\n") || normalized.includes("\r")) {
    return "/#auth";
  }
  return normalized;
}

function readOauthMetadata(record) {
  const metadata =
    record?.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata
      : {};
  const oauth = metadata.oauth && typeof metadata.oauth === "object" ? metadata.oauth : {};
  return { metadata, oauth };
}

function buildOAuthMetadata(existingMetadata, input) {
  const now = new Date().toISOString();
  return {
    ...existingMetadata,
    connectedBy: input.connectedBy,
    connectedVia: "oauth2",
    oauth: {
      provider: input.provider,
      token: input.token,
      tokenType: input.tokenType || "Bearer",
      hasRefreshToken: Boolean(input.hasRefreshToken),
      scope: Array.isArray(input.scope) ? input.scope : [],
      connectedAt: input.connectedAt || now,
      updatedAt: now,
      expiresAt: input.expiresAt || "",
      lastRefreshAt: input.lastRefreshAt || "",
      revokedAt: input.revokedAt || "",
      revokeResult:
        input.revokeResult && typeof input.revokeResult === "object"
          ? input.revokeResult
          : {},
    },
  };
}

function buildCallbackRedirect(c, payload) {
  const origin = new URL(c.req.url).origin;
  const target = new URL(safeReturnToPath(payload.returnTo), origin);
  target.searchParams.set("oauth", payload.status);
  target.searchParams.set("provider", payload.provider);
  if (payload.reason) {
    target.searchParams.set("reason", payload.reason);
  }
  return target.toString();
}

function integrationCliFlowPath(provider, flowId) {
  return `/api/integrations/${encodeURIComponent(provider)}/oauth/cli/${encodeURIComponent(flowId)}`;
}

export function registerIntegrationRoutes(app, options) {
  const database = options.database;
  const auditEmitter =
    typeof options.auditEmitter === "function" ? options.auditEmitter : () => {};

  app.get("/api/integrations/catalog", async (c) =>
    c.json({
      ok: true,
      providers: INTEGRATION_CATALOG.map((entry) => ({
        id: entry.id,
        provider: entry.id,
        displayName: entry.name,
        defaultAuthType: entry.defaultAuthType,
        oauth:
          entry.defaultAuthType === "oauth2"
            ? {
                configured: resolveIntegrationOAuthAvailability(entry.id).configured,
              }
            : null,
      })),
    })
  );

  app.get("/api/integrations", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);
    const records = await database.listUserIntegrations(auth.session.user.id);
    const byProvider = new Map(
      records.map((record) => [normalizeProvider(record.provider), record])
    );
    const items = INTEGRATION_CATALOG.map((entry) => {
      const record = byProvider.get(entry.id);
      if (!record) {
        return toApiIntegration(
          {
            provider: entry.id,
            displayName: entry.name,
            status: "disconnected",
            authType: entry.defaultAuthType,
            scopes: [],
            metadata: {},
          },
          entry
        );
      }
      return toApiIntegration(record, entry);
    });
    return c.json({ ok: true, items });
  });

  app.post("/api/integrations/:provider/oauth/cli/start", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);

    const provider = normalizeProvider(c.req.param("provider"));
    const definition = catalogById.get(provider);
    if (!provider || !definition || definition.defaultAuthType !== "oauth2") {
      return c.json({ error: "OAuth is unavailable for this provider." }, 404);
    }

    const availability = resolveIntegrationOAuthAvailability(provider);
    if (!availability.configured) {
      return c.json(
        {
          error: "OAuth provider is not configured.",
          missing: availability.missing,
        },
        503
      );
    }

    const flow = createCliBrowserFlow("integration-oauth", {
      provider,
      userId: auth.session.user.id,
    });
    const origin = new URL(c.req.url).origin;
    return c.json({
      ok: true,
      flowId: flow.flowId,
      provider,
      browserUrl: `${origin}${integrationCliFlowPath(provider, flow.flowId)}?view=browser`,
      pollUrl: integrationCliFlowPath(provider, flow.flowId),
      expiresAt: flow.expiresAt,
    });
  });

  app.get("/api/integrations/:provider/oauth/cli/:flowId", async (c) => {
    const provider = normalizeProvider(c.req.param("provider"));
    const flowId = asString(c.req.param("flowId"));
    const flow = getCliBrowserFlow(flowId);
    if (!flow || flow.kind !== "integration-oauth") {
      return c.json({ error: "CLI integration flow not found." }, 404);
    }
    if (asString(flow.payload?.provider) !== provider) {
      return c.json({ error: "CLI integration flow provider mismatch." }, 400);
    }

    if (String(c.req.query("view")).trim().toLowerCase() === "browser") {
      const auth = await requireSession(c, database);
      if (auth.error) {
        failCliBrowserFlow(flowId, "Authentication required.");
        return auth.error;
      }
      if (auth.session.user.id !== asString(flow.payload?.userId)) {
        failCliBrowserFlow(flowId, "CLI integration flow session mismatch.");
        return c.json({ error: "CLI integration flow session mismatch." }, 403);
      }

      const oauthStatus = asString(c.req.query("oauth")).toLowerCase();
      if (oauthStatus === "success") {
        const integration = await database.findUserIntegration(auth.session.user.id, provider);
        if (!integration || asString(integration.status) !== "connected") {
          failCliBrowserFlow(flowId, "Integration callback succeeded but no active connection was found.");
          return new Response("Integration callback did not create an active connection.", {
            status: 400,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        completeCliBrowserFlow(flowId, {
          provider,
          integration: toApiIntegration(integration, catalogById.get(provider)),
        });
        return new Response(
          "<!DOCTYPE html><html><body><p>Integration connected. Return to the Maple CLI.</p></body></html>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
      if (oauthStatus === "error") {
        const reason = asString(c.req.query("reason")) || "OAuth flow failed.";
        failCliBrowserFlow(flowId, reason);
        return new Response(`OAuth flow failed: ${reason}`, {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      const returnTo = `${integrationCliFlowPath(provider, flowId)}?view=browser`;
      return c.redirect(
        `/api/integrations/${encodeURIComponent(provider)}/oauth/start?redirect=1&returnTo=${encodeURIComponent(returnTo)}`,
        302
      );
    }

    return c.json(serializeCliBrowserFlow(flow));
  });

  app.get("/api/integrations/:provider/oauth/start", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);

    const provider = normalizeProvider(c.req.param("provider"));
    const definition = catalogById.get(provider);
    if (!provider || !definition || definition.defaultAuthType !== "oauth2") {
      return c.json({ error: "OAuth is unavailable for this provider." }, 404);
    }

    const availability = resolveIntegrationOAuthAvailability(provider);
    if (!availability.configured) {
      return c.json(
        {
          error: "OAuth provider is not configured.",
          missing: availability.missing,
        },
        503
      );
    }

    const returnTo = safeReturnToPath(c.req.query("returnTo"));
    const explicitRedirectUri = asString(c.req.query("redirectUri"));
    const scopeOverride = asString(c.req.query("scope"));
    const oauthStart = buildIntegrationOAuthStartResponse(
      availability.providerConfig,
      {
        provider,
        userId: auth.session.user.id,
        returnTo,
        redirectUri: explicitRedirectUri,
        scopeOverride,
      }
    );

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_LOW",
      summary: "integration oauth start",
      context: requestContextFromHeaders(c),
      payload: {
        action: "integrations.oauth.start",
        provider,
        userId: auth.session.user.id,
      },
    });

    if (parseRedirectToggle(c.req.query("redirect"))) {
      return c.redirect(oauthStart.authorizationUrl, 302);
    }

    return c.json({
      ok: true,
      provider,
      authorizationUrl: oauthStart.authorizationUrl,
      state: oauthStart.state,
      redirectUri: oauthStart.redirectUri,
      expiresInSeconds: oauthStart.expiresInSeconds,
    });
  });

  app.get("/api/integrations/:provider/oauth/callback", async (c) => {
    const provider = normalizeProvider(c.req.param("provider"));
    const definition = catalogById.get(provider);
    const responseFormat = asString(c.req.query("format")) || "";
    const preferJson = responseFormat.toLowerCase() === "json";

    if (!provider || !definition || definition.defaultAuthType !== "oauth2") {
      if (preferJson) {
        return c.json({ error: "OAuth is unavailable for this provider." }, 404);
      }
      return c.redirect(
        buildCallbackRedirect(c, {
          returnTo: c.req.query("returnTo"),
          status: "error",
          provider: provider || "unknown",
          reason: "provider_unsupported",
        }),
        302
      );
    }

    try {
      ensureIntegrationMethods(database);
      const code = asString(c.req.query("code"));
      const stateRaw = asString(c.req.query("state"));
      if (!code || !stateRaw) {
        throw new Error("OAuth callback requires code and state.");
      }
      const parsedState = parseIntegrationOAuthStateToken(stateRaw);
      if (parsedState.provider !== provider) {
        throw new Error("OAuth state provider does not match callback provider.");
      }

      const availability = resolveIntegrationOAuthAvailability(provider);
      if (!availability.configured) {
        throw new Error(
          `OAuth provider is not configured: ${availability.missing.join(", ")}`
        );
      }

      const redirectUri =
        asString(c.req.query("redirectUri")) ||
        `${String(availability.providerConfig.redirectBaseUrl || "").replace(/\/+$/g, "")}/api/integrations/${encodeURIComponent(provider)}/oauth/callback`;
      const tokenBundle = await exchangeIntegrationOAuthCode(
        availability.providerConfig,
        {
          code,
          redirectUri,
        }
      );
      const profile = await fetchIntegrationOAuthAccountProfile(
        availability.providerConfig,
        tokenBundle
      );

      const existing = await database.findUserIntegration(parsedState.userId, provider);
      const existingMetadata =
        existing?.metadata && typeof existing.metadata === "object"
          ? existing.metadata
          : {};
      const connectedAt = new Date().toISOString();
      const expiresAt =
        tokenBundle.expiresInSeconds > 0
          ? new Date(Date.now() + tokenBundle.expiresInSeconds * 1000).toISOString()
          : "";
      const encryptedToken = encryptIntegrationOAuthTokenBundle(tokenBundle);
      const metadata = buildOAuthMetadata(existingMetadata, {
        provider,
        token: encryptedToken,
        tokenType: tokenBundle.tokenType,
        hasRefreshToken: Boolean(tokenBundle.refreshToken),
        scope: tokenBundle.scope,
        connectedAt,
        expiresAt,
        connectedBy: parsedState.userId,
      });
      metadata.oauthProfile =
        profile.profile && typeof profile.profile === "object" ? profile.profile : {};
      const integration = await database.upsertUserIntegration({
        userId: parsedState.userId,
        provider,
        displayName:
          profile.displayName || existing?.displayName || definition.name,
        status: "connected",
        authType: "oauth2",
        externalAccountId:
          profile.externalAccountId ||
          asString(existing?.externalAccountId) ||
          "",
        scopes: tokenBundle.scope,
        metadata,
        connectedAt,
        disconnectedAt: null,
      });

      auditEmitter({
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        severity: "RISK_SEVERITY_LOW",
        summary: "integration oauth callback success",
        context: requestContextFromHeaders(c),
        payload: {
          action: "integrations.oauth.callback",
          provider,
          userId: parsedState.userId,
        },
      });

      if (preferJson) {
        return c.json({
          ok: true,
          provider,
          integration: toApiIntegration(integration, definition),
          redirectUrl: buildCallbackRedirect(c, {
            returnTo: parsedState.returnTo,
            status: "success",
            provider,
          }),
        });
      }

      return c.redirect(
        buildCallbackRedirect(c, {
          returnTo: parsedState.returnTo,
          status: "success",
          provider,
        }),
        302
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || "unknown_error");
      auditEmitter({
        eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
        severity: "RISK_SEVERITY_MEDIUM",
        summary: "integration oauth callback failure",
        context: requestContextFromHeaders(c),
        payload: {
          action: "integrations.oauth.callback",
          provider,
          error: message,
        },
      });
      if (preferJson) {
        return c.json({ error: message }, 400);
      }
      return c.redirect(
        buildCallbackRedirect(c, {
          returnTo: c.req.query("returnTo"),
          status: "error",
          provider,
          reason: message.slice(0, 180),
        }),
        302
      );
    }
  });

  app.post("/api/integrations/:provider/oauth/refresh", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);

    const provider = normalizeProvider(c.req.param("provider"));
    const definition = catalogById.get(provider);
    if (!provider || !definition || definition.defaultAuthType !== "oauth2") {
      return c.json({ error: "OAuth is unavailable for this provider." }, 404);
    }
    const availability = resolveIntegrationOAuthAvailability(provider);
    if (!availability.configured) {
      return c.json(
        {
          error: "OAuth provider is not configured.",
          missing: availability.missing,
        },
        503
      );
    }

    const existing = await database.findUserIntegration(auth.session.user.id, provider);
    if (!existing) {
      return c.json({ error: "Integration connection not found." }, 404);
    }
    const { metadata, oauth } = readOauthMetadata(existing);
    if (!oauth.token || typeof oauth.token !== "object") {
      return c.json({ error: "OAuth token bundle is missing." }, 409);
    }
    const storedBundle = decryptIntegrationOAuthTokenBundle(oauth.token);
    const refreshToken = asString(storedBundle.refreshToken);
    if (!refreshToken) {
      return c.json({ error: "Refresh token is unavailable for this integration." }, 409);
    }

    const refreshed = await refreshIntegrationOAuthToken(
      availability.providerConfig,
      refreshToken
    );
    const mergedBundle = {
      ...storedBundle,
      ...refreshed,
      refreshToken: refreshed.refreshToken || storedBundle.refreshToken || "",
      issuedAt: new Date().toISOString(),
    };
    const expiresAt =
      mergedBundle.expiresInSeconds > 0
        ? new Date(Date.now() + mergedBundle.expiresInSeconds * 1000).toISOString()
        : asString(oauth.expiresAt);
    const token = encryptIntegrationOAuthTokenBundle(mergedBundle);
    const updated = await database.upsertUserIntegration({
      userId: auth.session.user.id,
      provider,
      displayName: asString(existing.displayName) || definition.name,
      status: "connected",
      authType: "oauth2",
      externalAccountId: asString(existing.externalAccountId),
      scopes:
        Array.isArray(mergedBundle.scope) && mergedBundle.scope.length > 0
          ? mergedBundle.scope
          : Array.isArray(existing.scopes)
            ? existing.scopes
            : [],
      metadata: buildOAuthMetadata(metadata, {
        provider,
        token,
        tokenType: mergedBundle.tokenType,
        hasRefreshToken: Boolean(mergedBundle.refreshToken),
        scope: mergedBundle.scope,
        connectedAt: asString(oauth.connectedAt),
        expiresAt,
        lastRefreshAt: new Date().toISOString(),
        connectedBy: auth.session.user.id,
      }),
      connectedAt: asString(existing.connectedAt) || new Date().toISOString(),
      disconnectedAt: null,
    });

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_LOW",
      summary: "integration oauth refresh",
      context: requestContextFromHeaders(c),
      payload: {
        action: "integrations.oauth.refresh",
        provider,
        userId: auth.session.user.id,
      },
    });

    return c.json({
      ok: true,
      provider,
      integration: toApiIntegration(updated, definition),
    });
  });

  app.post("/api/integrations/:provider/oauth/revoke", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);

    const provider = normalizeProvider(c.req.param("provider"));
    const definition = catalogById.get(provider);
    if (!provider || !definition || definition.defaultAuthType !== "oauth2") {
      return c.json({ error: "OAuth is unavailable for this provider." }, 404);
    }
    const availability = resolveIntegrationOAuthAvailability(provider);
    if (!availability.configured) {
      return c.json(
        {
          error: "OAuth provider is not configured.",
          missing: availability.missing,
        },
        503
      );
    }

    const existing = await database.findUserIntegration(auth.session.user.id, provider);
    if (!existing) {
      return c.json({ error: "Integration connection not found." }, 404);
    }
    const { metadata, oauth } = readOauthMetadata(existing);
    let revokeResult = { revoked: false, reason: "no_token_bundle" };
    if (oauth.token && typeof oauth.token === "object") {
      const storedBundle = decryptIntegrationOAuthTokenBundle(oauth.token);
      const token =
        asString(storedBundle.accessToken) || asString(storedBundle.refreshToken);
      if (token) {
        revokeResult = await revokeIntegrationOAuthToken(
          availability.providerConfig,
          token
        );
      }
    }

    const disconnectedAt = new Date().toISOString();
    const updated = await database.upsertUserIntegration({
      userId: auth.session.user.id,
      provider,
      displayName: asString(existing.displayName) || definition.name,
      status: "disconnected",
      authType: "oauth2",
      externalAccountId: asString(existing.externalAccountId),
      scopes: [],
      metadata: buildOAuthMetadata(metadata, {
        provider,
        token: null,
        tokenType: "",
        hasRefreshToken: false,
        scope: [],
        connectedAt: asString(oauth.connectedAt),
        expiresAt: "",
        revokedAt: disconnectedAt,
        revokeResult,
        connectedBy: auth.session.user.id,
      }),
      connectedAt: asString(existing.connectedAt) || null,
      disconnectedAt,
    });

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_MEDIUM",
      summary: "integration oauth revoke",
      context: requestContextFromHeaders(c),
      payload: {
        action: "integrations.oauth.revoke",
        provider,
        userId: auth.session.user.id,
        revokeResult,
      },
    });

    return c.json({
      ok: true,
      provider,
      integration: toApiIntegration(updated, definition),
    });
  });

  app.post("/api/integrations/:provider/connect", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);

    const provider = normalizeProvider(c.req.param("provider"));
    const definition = catalogById.get(provider);
    if (!provider || !definition) {
      return c.json({ error: "Unsupported integration provider." }, 404);
    }

    const body = await readJsonBody(c);
    const credential =
      asString(body.credential) ||
      asString(body.token) ||
      asString(body.apiKey) ||
      asString(body.authCode) ||
      asString(body.code);
    if (!credential) {
      return c.json({ error: "credential is required to connect integration." }, 400);
    }

    const connectedAt = new Date().toISOString();
    const scopes = parseScopes(body.scopes);
    const metadataInput =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};
    const integration = await database.upsertUserIntegration({
      userId: auth.session.user.id,
      provider,
      displayName: asString(body.displayName) || definition.name,
      status: "connected",
      authType: asString(body.authType) || definition.defaultAuthType,
      externalAccountId: asString(body.externalAccountId),
      scopes,
      metadata: {
        ...metadataInput,
        connectedBy: auth.session.user.id,
        connectedVia: asString(body.connectedVia) || "desktop",
        credentialFingerprint: credentialFingerprint(credential),
      },
      connectedAt,
      disconnectedAt: null,
    });

    return c.json(
      {
        ok: true,
        integration: toApiIntegration(integration, definition),
      },
      201
    );
  });

  app.post("/api/integrations/:provider/disconnect", async (c) => {
    const auth = await requireSession(c, database);
    if (auth.error) {
      return auth.error;
    }
    ensureIntegrationMethods(database);

    const provider = normalizeProvider(c.req.param("provider"));
    if (!provider) {
      return c.json({ error: "provider is required." }, 400);
    }
    const existing = await database.findUserIntegration(auth.session.user.id, provider);
    if (!existing) {
      return c.json({ error: "Integration connection not found." }, 404);
    }
    const { metadata, oauth } = readOauthMetadata(existing);
    const disconnectedAt = new Date().toISOString();
    const disconnected = await database.upsertUserIntegration({
      userId: auth.session.user.id,
      provider,
      displayName: asString(existing.displayName) || catalogById.get(provider)?.name || provider,
      status: "disconnected",
      authType: asString(existing.authType) || catalogById.get(provider)?.defaultAuthType || "none",
      externalAccountId: asString(existing.externalAccountId),
      scopes: [],
      metadata: oauth && typeof oauth === "object"
        ? buildOAuthMetadata(metadata, {
            provider,
            token: null,
            tokenType: "",
            hasRefreshToken: false,
            scope: [],
            connectedAt: asString(oauth.connectedAt),
            expiresAt: "",
            revokedAt: disconnectedAt,
            revokeResult: { revoked: false, reason: "manual_disconnect" },
            connectedBy: auth.session.user.id,
          })
        : {
            ...metadata,
            disconnectedBy: auth.session.user.id,
            disconnectedAt,
          },
      connectedAt: asString(existing.connectedAt) || null,
      disconnectedAt,
    });

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_LOW",
      summary: "integration disconnected",
      context: requestContextFromHeaders(c),
      payload: {
        action: "integrations.disconnect",
        provider,
        userId: auth.session.user.id,
      },
    });

    return c.json({
      ok: true,
      integration: toApiIntegration(disconnected, catalogById.get(provider)),
    });
  });
}
