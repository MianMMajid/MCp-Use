import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { asString, errorMessage } from "@maple/common";
import {
  businessApiBaseUrl,
  businessApiProxyCaPath,
  businessApiProxyCertPath,
  businessApiProxyKeyPath,
  businessApiProxyTimeoutMs,
  businessApiRequired,
} from "../config.js";
import { mapleLog } from "../logging.js";
import { apiErrorPayload } from "../api-error.js";
import { recordServiceCall } from "./service-utilization.js";

const FORWARDED_HEADERS = [
  "cookie",
  "authorization",
  "x-request-id",
  "x-forwarded-for",
  "x-trace-id",
  "x-maple-tenant-id",
  "x-maple-user-id",
  "x-maple-device-id",
  "x-maple-session-id",
];

const CONTEXT_HEADER_ALIASES = [
  { target: "x-maple-tenant-id", sources: ["x-maple-tenant-id", "x-tenant-id"] },
  { target: "x-maple-user-id", sources: ["x-maple-user-id", "x-user-id"] },
  { target: "x-maple-device-id", sources: ["x-maple-device-id", "x-device-id", "user-agent"] },
  {
    target: "x-maple-session-id",
    sources: ["x-maple-session-id", "mcp-session-id", "x-session-id"],
  },
  { target: "x-trace-id", sources: ["x-trace-id", "x-maple-trace-id"] },
];

let cachedBusinessApiCaPem;
let cachedBusinessApiCaPath;
let cachedBusinessApiCertPem;
let cachedBusinessApiCertPath;
let cachedBusinessApiKeyPem;
let cachedBusinessApiKeyPath;

function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function currentBusinessApiBaseUrl(fallback) {
  return asString(process.env.MAPLE_BUSINESS_API_BASE_URL) ?? fallback;
}

function currentBusinessApiRequired() {
  const explicit = asString(process.env.MAPLE_BUSINESS_API_REQUIRED);
  if (explicit !== undefined) {
    return parseBoolean(explicit);
  }
  if (String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    return true;
  }
  return businessApiRequired;
}

function loadPem(pathname, cache) {
  if (!pathname) {
    return undefined;
  }

  if (cache.path === pathname && cache.value) {
    return cache.value;
  }

  const loaded = readFileSync(pathname, "utf8");
  cache.path = pathname;
  cache.value = loaded;
  return loaded;
}

function loadBusinessApiMtlsMaterial(caPath, certPath, keyPath) {
  return {
    caPem: loadPem(caPath, {
      get path() {
        return cachedBusinessApiCaPath;
      },
      set path(value) {
        cachedBusinessApiCaPath = value;
      },
      get value() {
        return cachedBusinessApiCaPem;
      },
      set value(value) {
        cachedBusinessApiCaPem = value;
      },
    }),
    certPem: loadPem(certPath, {
      get path() {
        return cachedBusinessApiCertPath;
      },
      set path(value) {
        cachedBusinessApiCertPath = value;
      },
      get value() {
        return cachedBusinessApiCertPem;
      },
      set value(value) {
        cachedBusinessApiCertPem = value;
      },
    }),
    keyPem: loadPem(keyPath, {
      get path() {
        return cachedBusinessApiKeyPath;
      },
      set path(value) {
        cachedBusinessApiKeyPath = value;
      },
      get value() {
        return cachedBusinessApiKeyPem;
      },
      set value(value) {
        cachedBusinessApiKeyPem = value;
      },
    }),
  };
}

function parseJsonResponseBody(rawBody, statusCode) {
  const body = rawBody.trim();
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {
      error: body,
      statusCode,
    };
  }
}

function requestJson(target, options) {
  const isHttps = target.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port
          ? Number.parseInt(target.port, 10)
          : isHttps
            ? 443
            : 80,
        method: options.method,
        path: `${target.pathname}${target.search}`,
        headers: options.headers,
        timeout: options.timeoutMs,
        ...(isHttps && options.caPem ? { ca: options.caPem } : {}),
        ...(isHttps && options.certPem ? { cert: options.certPem } : {}),
        ...(isHttps && options.keyPem ? { key: options.keyPem } : {}),
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const setCookieHeader = response.headers["set-cookie"];
          const setCookie = Array.isArray(setCookieHeader)
            ? setCookieHeader
            : typeof setCookieHeader === "string"
              ? [setCookieHeader]
              : [];
          resolve({
            statusCode: response.statusCode ?? 502,
            body,
            headers: { setCookie },
          });
        });
      }
    );

    req.on("error", reject);

    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new Error(`business-api request timeout after ${options.timeoutMs}ms`));
    });

    if (options.bodyText !== undefined) {
      req.write(options.bodyText);
    }

    req.end();
  });
}

function buildForwardHeaders(c, options) {
  const headers = {
    accept: "application/json",
    "x-maple-source-service": "gateway-api",
  };

  for (const headerName of FORWARDED_HEADERS) {
    const value = c.req.header(headerName);
    if (value) {
      headers[headerName] = value;
    }
  }

  for (const alias of CONTEXT_HEADER_ALIASES) {
    if (headers[alias.target]) {
      continue;
    }
    for (const source of alias.sources) {
      const value = c.req.header(source);
      if (!value) {
        continue;
      }
      headers[alias.target] = value;
      break;
    }
  }

  if (options.bodyText !== undefined) {
    headers["content-type"] = options.contentType ?? "application/json";
    headers["content-length"] = String(Buffer.byteLength(options.bodyText, "utf8"));
  }

  if (options.extraHeaders && typeof options.extraHeaders === "object") {
    for (const [name, value] of Object.entries(options.extraHeaders)) {
      if (!name || value === undefined || value === null || value === "") {
        continue;
      }
      headers[name.toLowerCase()] = String(value);
    }
  }

  return headers;
}

function resolveTargetUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.startsWith("/") ? path : `/${path}`, normalizedBase);
}

function resolvedTimeoutMs(override) {
  const raw =
    override ??
    asString(process.env.MAPLE_BUSINESS_API_TIMEOUT_MS) ??
    businessApiProxyTimeoutMs;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed)) {
    return 3_000;
  }
  return Math.max(250, Math.min(15_000, parsed));
}

export function isBusinessApiProxyConfigured(baseUrl = businessApiBaseUrl) {
  return Boolean(asString(currentBusinessApiBaseUrl(baseUrl)));
}

export function isBusinessApiRequired() {
  return currentBusinessApiRequired();
}

export function businessApiUnavailableResponse(c, proxiedResponse, operation) {
  return c.json({
    ...apiErrorPayload(
      "BUSINESS_API_UNAVAILABLE",
      "Business API unavailable",
      proxiedResponse?.error ?? "Business API is required but unreachable."
    ),
    operation,
    reason: proxiedResponse?.reason ?? "request_failed",
  }, 503);
}

export async function proxyBusinessApiRequest(c, path, options = {}) {
  const startedAtMs = Date.now();
  const method = options.method ?? "GET";
  const resolvedBaseUrl = asString(
    options.baseUrl ?? currentBusinessApiBaseUrl(businessApiBaseUrl)
  );
  if (!resolvedBaseUrl) {
    recordServiceCall({
      caller: "gateway-api",
      service: "business-api",
      operation: `${method} ${path}`,
      status: "error",
      latencyMs: Date.now() - startedAtMs,
      routeId: `${c.req.method} ${c.req.path}`,
      traceId: asString(c.req.header("x-maple-trace-id") ?? c.req.header("x-trace-id")) ?? "",
      tenantId: asString(c.req.header("x-maple-tenant-id") ?? c.req.header("x-tenant-id")) ?? "",
    });
    return {
      proxied: false,
      reason: "not_configured",
    };
  }

  const target = resolveTargetUrl(resolvedBaseUrl, path);
  const bodyJson = options.body ? JSON.stringify(options.body) : undefined;
  const bodyText =
    options.rawBody !== undefined
      ? typeof options.rawBody === "string"
        ? options.rawBody
        : String(options.rawBody)
      : bodyJson;
  const timeoutMs = resolvedTimeoutMs(options.timeoutMs);

  try {
    const caPath = asString(options.caPath ?? process.env.MAPLE_BUSINESS_API_CA) ?? businessApiProxyCaPath;
    const certPath =
      asString(options.certPath ?? process.env.MAPLE_BUSINESS_API_CERT) ??
      businessApiProxyCertPath;
    const keyPath =
      asString(options.keyPath ?? process.env.MAPLE_BUSINESS_API_KEY) ??
      businessApiProxyKeyPath;
    const tlsMaterial =
      target.protocol === "https:"
        ? loadBusinessApiMtlsMaterial(caPath, certPath, keyPath)
        : { caPem: undefined, certPem: undefined, keyPem: undefined };

    const response = await requestJson(target, {
      method: options.method ?? "GET",
      timeoutMs,
      bodyText,
      headers: buildForwardHeaders(c, {
        bodyText,
        contentType: options.contentType,
        extraHeaders: options.headers,
      }),
      caPem: tlsMaterial.caPem,
      certPem: tlsMaterial.certPem,
      keyPem: tlsMaterial.keyPem,
    });

    recordServiceCall({
      caller: "gateway-api",
      service: "business-api",
      operation: `${method} ${path}`,
      status: response.statusCode >= 200 && response.statusCode < 500 ? "ok" : "error",
      latencyMs: Date.now() - startedAtMs,
      routeId: `${c.req.method} ${c.req.path}`,
      traceId: asString(c.req.header("x-maple-trace-id") ?? c.req.header("x-trace-id")) ?? "",
      tenantId: asString(c.req.header("x-maple-tenant-id") ?? c.req.header("x-tenant-id")) ?? "",
    });

    return {
      proxied: true,
      status: response.statusCode,
      payload: parseJsonResponseBody(response.body, response.statusCode),
      headers: response.headers,
    };
  } catch (err) {
    recordServiceCall({
      caller: "gateway-api",
      service: "business-api",
      operation: `${method} ${path}`,
      status: "error",
      latencyMs: Date.now() - startedAtMs,
      routeId: `${c.req.method} ${c.req.path}`,
      traceId: asString(c.req.header("x-maple-trace-id") ?? c.req.header("x-trace-id")) ?? "",
      tenantId: asString(c.req.header("x-maple-tenant-id") ?? c.req.header("x-tenant-id")) ?? "",
    });
    mapleLog("warn", "gateway.business_api_proxy_failed", {
      target: target.toString(),
      method,
      error: errorMessage(err),
    });

    return {
      proxied: false,
      reason: "request_failed",
      error: errorMessage(err),
    };
  }
}

export function applyBusinessApiProxyHeaders(c, proxiedResponse) {
  const setCookies = Array.isArray(proxiedResponse?.headers?.setCookie)
    ? proxiedResponse.headers.setCookie
    : [];
  for (const cookieValue of setCookies) {
    if (!cookieValue) {
      continue;
    }
    c.header("set-cookie", cookieValue, { append: true });
  }
}
