import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { asString } from "@maple/common";

const OAUTH_PROVIDER_DEFAULTS = {
  "google-workspace": {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope:
      "openid email profile https://www.googleapis.com/auth/gmail.readonly",
    tokenExtraParams: { access_type: "offline", prompt: "consent" },
    accountIdPath: "sub",
    displayNamePath: "name",
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    revokeUrl: "https://slack.com/api/auth.revoke",
    scope: "channels:read,users:read,chat:write",
  },
  notion: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    revokeUrl: "https://api.notion.com/v1/oauth/revoke",
    scope: "read",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: "read:user user:email repo",
    accountIdPath: "id",
    displayNamePath: "login",
  },
  jira: {
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    revokeUrl: "https://auth.atlassian.com/oauth/revoke",
    userInfoUrl: "https://api.atlassian.com/me",
    scope: "offline_access read:jira-user read:jira-work",
    audience: "api.atlassian.com",
    accountIdPath: "account_id",
    displayNamePath: "name",
  },
  linear: {
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scope: "read",
  },
  salesforce: {
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    revokeUrl: "https://login.salesforce.com/services/oauth2/revoke",
    userInfoUrl: "https://login.salesforce.com/services/oauth2/userinfo",
    scope: "api refresh_token",
    accountIdPath: "user_id",
    displayNamePath: "name",
  },
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    revokeUrl: "https://api.hubapi.com/oauth/v1/token/revoke",
    scope: "crm.objects.contacts.read",
  },
};

const INTEGRATION_OAUTH_STATE_TTL_SECONDS = 10 * 60;

function parseJsonEnv(rawValue, fallbackValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return fallbackValue;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallbackValue;
  }
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

function normalizeProviderEnvPrefix(provider) {
  return String(provider ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
}

function providerEnvValue(provider, suffix) {
  const prefix = normalizeProviderEnvPrefix(provider);
  return (
    asString(process.env[`MAPLE_${prefix}_${suffix}`]) ??
    asString(process.env[`${prefix}_${suffix}`]) ??
    ""
  );
}

function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function resolveOAuthStateSecret() {
  return (
    asString(process.env.MAPLE_INTEGRATION_OAUTH_STATE_SECRET) ??
    asString(process.env.MAPLE_BUSINESS_API_STATE_SECRET) ??
    ""
  );
}

function resolveOAuthEncryptionKeyRaw() {
  return asString(process.env.MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY) ?? "";
}

function normalizeEncryptionKey(rawKey) {
  const normalized = String(rawKey ?? "").trim();
  if (!normalized) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Ignore invalid base64 and fallback to hash derivation.
  }
  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return Buffer.from(normalized, "hex");
  }
  return createHash("sha256").update(normalized).digest();
}

function signOAuthState(payloadBase64, secret) {
  return toBase64Url(
    createHmac("sha256", secret).update(payloadBase64).digest()
  );
}

export function createIntegrationOAuthStateToken(input) {
  const secret = resolveOAuthStateSecret();
  if (!secret) {
    throw new Error("MAPLE_INTEGRATION_OAUTH_STATE_SECRET is not configured.");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    provider: String(input.provider ?? "").trim().toLowerCase(),
    userId: String(input.userId ?? ""),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + INTEGRATION_OAUTH_STATE_TTL_SECONDS,
    nonce: toBase64Url(randomBytes(18)),
    returnTo: String(input.returnTo ?? ""),
  };
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = signOAuthState(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

export function parseIntegrationOAuthStateToken(rawToken) {
  const secret = resolveOAuthStateSecret();
  if (!secret) {
    throw new Error("MAPLE_INTEGRATION_OAUTH_STATE_SECRET is not configured.");
  }
  const token = String(rawToken ?? "").trim();
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    throw new Error("OAuth state is malformed.");
  }
  const expectedSignature = signOAuthState(payloadBase64, secret);
  if (signature !== expectedSignature) {
    throw new Error("OAuth state signature is invalid.");
  }
  const payload = parseJsonEnv(
    fromBase64Url(payloadBase64).toString("utf8"),
    undefined
  );
  if (!payload || typeof payload !== "object") {
    throw new Error("OAuth state payload is invalid.");
  }
  const expiresAt = Number(payload.expiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("OAuth state has expired.");
  }
  return {
    provider: String(payload.provider ?? "").trim().toLowerCase(),
    userId: String(payload.userId ?? "").trim(),
    returnTo: String(payload.returnTo ?? "").trim(),
    issuedAt: Number(payload.issuedAt ?? 0),
    expiresAt,
    nonce: String(payload.nonce ?? ""),
  };
}

export function encryptIntegrationOAuthTokenBundle(payload) {
  const encryptionKeyRaw = resolveOAuthEncryptionKeyRaw();
  const key = normalizeEncryptionKey(encryptionKeyRaw);
  if (!key) {
    throw new Error(
      "MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY is not configured."
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: 1,
    iv: toBase64Url(iv),
    tag: toBase64Url(authTag),
    cipherText: toBase64Url(ciphertext),
  };
}

export function decryptIntegrationOAuthTokenBundle(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== "object") {
    throw new Error("Encrypted OAuth bundle is missing.");
  }
  const encryptionKeyRaw = resolveOAuthEncryptionKeyRaw();
  const key = normalizeEncryptionKey(encryptionKeyRaw);
  if (!key) {
    throw new Error(
      "MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY is not configured."
    );
  }
  const iv = fromBase64Url(String(encryptedPayload.iv ?? ""));
  const authTag = fromBase64Url(String(encryptedPayload.tag ?? ""));
  const ciphertext = fromBase64Url(String(encryptedPayload.cipherText ?? ""));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  const parsed = parseJsonEnv(plaintext, undefined);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unable to decode OAuth token bundle.");
  }
  return parsed;
}

function pathValue(source, pathSpec) {
  if (!source || typeof source !== "object" || !pathSpec) {
    return undefined;
  }
  const steps = String(pathSpec)
    .split(".")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  let current = source;
  for (const step of steps) {
    if (!current || typeof current !== "object" || !(step in current)) {
      return undefined;
    }
    current = current[step];
  }
  return current;
}

function normalizeTokenPayload(payload, provider) {
  if (!payload || typeof payload !== "object") {
    throw new Error("OAuth token exchange returned an invalid response.");
  }
  if (provider === "slack" && payload.ok !== true) {
    throw new Error(
      `Slack OAuth exchange failed: ${String(payload.error ?? "unknown_error")}`
    );
  }
  const accessToken =
    asString(payload.access_token) ??
    asString(payload.authed_user?.access_token) ??
    "";
  if (!accessToken) {
    throw new Error("OAuth token response did not include access_token.");
  }
  const refreshToken =
    asString(payload.refresh_token) ??
    asString(payload.authed_user?.refresh_token) ??
    "";
  const expiresInRaw =
    Number(payload.expires_in) ||
    Number(payload.authed_user?.expires_in) ||
    Number(payload.expires_in_seconds) ||
    0;
  const expiresInSeconds = Number.isFinite(expiresInRaw) && expiresInRaw > 0
    ? Math.round(expiresInRaw)
    : 0;
  const scope =
    asString(payload.scope) ??
    asString(payload.authed_user?.scope) ??
    asString(payload.scopes) ??
    "";
  const scopeList = normalizeScopes(scope);
  return {
    accessToken,
    refreshToken,
    tokenType:
      asString(payload.token_type) ??
      asString(payload.authed_user?.token_type) ??
      "Bearer",
    scope: scopeList,
    expiresInSeconds,
    issuedAt: new Date().toISOString(),
    raw: payload,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
  });
  const text = await response.text();
  const payload = parseJsonEnv(text, undefined);
  return { response, payload, text };
}

function queryEncode(params) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }
  return searchParams;
}

function parseOAuthOverrides() {
  return parseJsonEnv(process.env.MAPLE_INTEGRATION_OAUTH_OVERRIDES_JSON, {});
}

export function resolveIntegrationOAuthProviderConfig(provider) {
  const normalizedProvider = String(provider ?? "")
    .trim()
    .toLowerCase();
  const defaults = OAUTH_PROVIDER_DEFAULTS[normalizedProvider] ?? {};
  const overrides = parseOAuthOverrides();
  const overrideConfig =
    overrides && typeof overrides === "object"
      ? overrides[normalizedProvider] ?? {}
      : {};

  const authorizeUrl =
    asString(overrideConfig.authorizeUrl) ||
    providerEnvValue(normalizedProvider, "OAUTH_AUTHORIZE_URL") ||
    defaults.authorizeUrl ||
    "";
  const tokenUrl =
    asString(overrideConfig.tokenUrl) ||
    providerEnvValue(normalizedProvider, "OAUTH_TOKEN_URL") ||
    defaults.tokenUrl ||
    "";
  const revokeUrl =
    asString(overrideConfig.revokeUrl) ||
    providerEnvValue(normalizedProvider, "OAUTH_REVOKE_URL") ||
    defaults.revokeUrl ||
    "";
  const userInfoUrl =
    asString(overrideConfig.userInfoUrl) ||
    providerEnvValue(normalizedProvider, "OAUTH_USERINFO_URL") ||
    defaults.userInfoUrl ||
    "";
  const scope =
    asString(overrideConfig.scope) ||
    providerEnvValue(normalizedProvider, "OAUTH_SCOPE") ||
    defaults.scope ||
    "";
  const audience =
    asString(overrideConfig.audience) ||
    providerEnvValue(normalizedProvider, "OAUTH_AUDIENCE") ||
    defaults.audience ||
    "";
  const clientId =
    asString(overrideConfig.clientId) ||
    providerEnvValue(normalizedProvider, "OAUTH_CLIENT_ID") ||
    "";
  const clientSecret =
    asString(overrideConfig.clientSecret) ||
    providerEnvValue(normalizedProvider, "OAUTH_CLIENT_SECRET") ||
    "";
  const redirectBaseUrl =
    asString(overrideConfig.redirectBaseUrl) ||
    asString(process.env.MAPLE_INTEGRATION_OAUTH_REDIRECT_BASE_URL) ||
    "";
  const authExtraParams = {
    ...(defaults.tokenExtraParams ?? {}),
    ...(parseJsonEnv(providerEnvValue(normalizedProvider, "OAUTH_AUTH_PARAMS_JSON"), {}) ??
      {}),
    ...(overrideConfig.authParams && typeof overrideConfig.authParams === "object"
      ? overrideConfig.authParams
      : {}),
  };
  const tokenExtraParams = {
    ...(parseJsonEnv(providerEnvValue(normalizedProvider, "OAUTH_TOKEN_PARAMS_JSON"), {}) ??
      {}),
    ...(overrideConfig.tokenParams && typeof overrideConfig.tokenParams === "object"
      ? overrideConfig.tokenParams
      : {}),
  };
  const accountIdPath =
    asString(overrideConfig.accountIdPath) ||
    providerEnvValue(normalizedProvider, "OAUTH_ACCOUNT_ID_PATH") ||
    defaults.accountIdPath ||
    "";
  const displayNamePath =
    asString(overrideConfig.displayNamePath) ||
    providerEnvValue(normalizedProvider, "OAUTH_DISPLAY_NAME_PATH") ||
    defaults.displayNamePath ||
    "";

  const missing = [];
  if (!clientId) missing.push("clientId");
  if (!clientSecret) missing.push("clientSecret");
  if (!authorizeUrl) missing.push("authorizeUrl");
  if (!tokenUrl) missing.push("tokenUrl");
  if (!redirectBaseUrl) missing.push("redirectBaseUrl");

  return {
    provider: normalizedProvider,
    configured: missing.length === 0,
    missing,
    clientId,
    clientSecret,
    authorizeUrl,
    tokenUrl,
    revokeUrl,
    userInfoUrl,
    scope,
    audience,
    redirectBaseUrl,
    authExtraParams,
    tokenExtraParams,
    accountIdPath,
    displayNamePath,
  };
}

export function resolveIntegrationOAuthAvailability(provider) {
  const stateSecretConfigured = resolveOAuthStateSecret().length > 0;
  const encryptionConfigured = resolveOAuthEncryptionKeyRaw().length > 0;
  const providerConfig = resolveIntegrationOAuthProviderConfig(provider);
  const configured =
    stateSecretConfigured && encryptionConfigured && providerConfig.configured;
  return {
    configured,
    providerConfig,
    stateSecretConfigured,
    encryptionConfigured,
    missing: [
      ...(!stateSecretConfigured ? ["MAPLE_INTEGRATION_OAUTH_STATE_SECRET"] : []),
      ...(!encryptionConfigured
        ? ["MAPLE_INTEGRATION_OAUTH_ENCRYPTION_KEY"]
        : []),
      ...providerConfig.missing.map(
        (entry) => `${provider}:${entry}`
      ),
    ],
  };
}

function resolveRedirectUri(config, provider, explicitRedirectUri) {
  const explicit = asString(explicitRedirectUri);
  if (explicit) {
    return explicit;
  }
  const base = String(config.redirectBaseUrl || "").replace(/\/+$/g, "");
  return `${base}/api/integrations/${encodeURIComponent(
    provider
  )}/oauth/callback`;
}

export function buildIntegrationOAuthStartResponse(config, input) {
  const redirectUri = resolveRedirectUri(config, input.provider, input.redirectUri);
  const state = createIntegrationOAuthStateToken({
    provider: input.provider,
    userId: input.userId,
    returnTo: input.returnTo,
  });
  const params = queryEncode({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: input.scopeOverride || config.scope,
    state,
    audience: config.audience || undefined,
    ...config.authExtraParams,
  });
  const authorizationUrl = `${config.authorizeUrl}${
    config.authorizeUrl.includes("?") ? "&" : "?"
  }${params.toString()}`;
  return {
    authorizationUrl,
    state,
    redirectUri,
    expiresInSeconds: INTEGRATION_OAUTH_STATE_TTL_SECONDS,
  };
}

async function exchangeToken(config, params) {
  const form = queryEncode({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...params,
    ...config.tokenExtraParams,
  });
  const { response, payload, text } = await fetchJson(config.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    throw new Error(
      `OAuth token exchange failed (${response.status}): ${
        asString(payload?.error_description) ||
        asString(payload?.error) ||
        text ||
        "unknown_error"
      }`
    );
  }
  return normalizeTokenPayload(payload, config.provider);
}

export async function exchangeIntegrationOAuthCode(config, input) {
  return exchangeToken(config, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
}

export async function refreshIntegrationOAuthToken(config, refreshToken) {
  return exchangeToken(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function revokeIntegrationOAuthToken(config, token) {
  if (!config.revokeUrl) {
    return { revoked: false, reason: "revoke_url_not_configured" };
  }
  const form = queryEncode({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    token,
  });
  const { response, payload, text } = await fetchJson(config.revokeUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    throw new Error(
      `OAuth revoke failed (${response.status}): ${
        asString(payload?.error_description) ||
        asString(payload?.error) ||
        text ||
        "unknown_error"
      }`
    );
  }
  return { revoked: true };
}

export async function fetchIntegrationOAuthAccountProfile(config, tokenBundle) {
  const accessToken = asString(tokenBundle?.accessToken);
  if (!config.userInfoUrl || !accessToken) {
    return {};
  }
  const { response, payload } = await fetchJson(config.userInfoUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "maple-business-api/1.0",
    },
  });
  if (!response.ok || !payload || typeof payload !== "object") {
    return {};
  }
  const externalAccountId =
    asString(pathValue(payload, config.accountIdPath)) ??
    asString(payload.id) ??
    asString(payload.sub) ??
    "";
  const displayName =
    asString(pathValue(payload, config.displayNamePath)) ??
    asString(payload.name) ??
    asString(payload.login) ??
    "";
  return {
    externalAccountId,
    displayName,
    profile: payload,
  };
}
