import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { Command } = require("commander");

export { Command };

const DEFAULT_GATEWAY_ORIGIN = process.env.MAPLE_GATEWAY_ORIGIN || "http://127.0.0.1:3000";

export const CLI_HOME = resolve(homedir(), ".maple", "cli");
export const PROFILES_PATH = resolve(CLI_HOME, "profiles.json");
export const COOKIES_PATH = resolve(CLI_HOME, "cookies.json");

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
}

function readJsonFile(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}

export function writeOutputFile(filePath, value) {
  ensureParentDir(filePath);
  writeFileSync(resolve(filePath), value, {
    mode: 0o600,
  });
  chmodSync(resolve(filePath), 0o600);
}

function normalizeOrigin(value, fallback) {
  const candidate = String(value || fallback || "").trim();
  if (!candidate) {
    return fallback;
  }
  const parsed = new URL(candidate);
  return parsed.origin;
}

function deriveAdminOrigin(gatewayOrigin) {
  const explicit = String(process.env.MAPLE_ADMIN_CONSOLE_ORIGIN || "").trim();
  if (explicit) {
    return normalizeOrigin(explicit, gatewayOrigin);
  }
  try {
    const parsed = new URL(gatewayOrigin);
    const isLocal = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (isLocal) {
      return `${parsed.protocol}//${parsed.hostname}:9443`;
    }
    return `${parsed.protocol}//${parsed.hostname}:4001`;
  } catch {
    return "https://127.0.0.1:9443";
  }
}

function defaultProfile() {
  const gatewayOrigin = normalizeOrigin(process.env.MAPLE_GATEWAY_ORIGIN, DEFAULT_GATEWAY_ORIGIN);
  return {
    gatewayOrigin,
    adminOrigin: deriveAdminOrigin(gatewayOrigin),
    apiKey: process.env.MAPLE_API_KEY || "",
    adminApiKey: process.env.MAPLE_ADMIN_API_KEY || "",
    caCert: process.env.MAPLE_CLI_CA_CERT || "",
    clientCert: process.env.MAPLE_CLI_CLIENT_CERT || "",
    clientKey: process.env.MAPLE_CLI_CLIENT_KEY || "",
    insecure:
      String(process.env.MAPLE_CLI_INSECURE || "")
        .trim()
        .toLowerCase() === "true" ||
      String(process.env.MAPLE_CLI_INSECURE || "").trim() === "1",
  };
}

export function loadProfiles() {
  const store = readJsonFile(PROFILES_PATH, {});
  const profiles = store.profiles && typeof store.profiles === "object" ? store.profiles : {};
  if (!profiles.default) {
    profiles.default = defaultProfile();
  }
  return {
    current:
      String(process.env.MAPLE_CLI_PROFILE || store.current || "default").trim() || "default",
    profiles,
  };
}

export function saveProfiles(store) {
  writeJsonFile(PROFILES_PATH, store);
}

export function loadCookies() {
  return readJsonFile(COOKIES_PATH, { profiles: {} });
}

export function saveCookies(store) {
  writeJsonFile(COOKIES_PATH, store);
}

export function resolveProfile(profileName) {
  const store = loadProfiles();
  const name = String(profileName || store.current || "default").trim() || "default";
  const profile = {
    ...defaultProfile(),
    ...(store.profiles[name] || {}),
  };
  return { name, profile, store };
}

function parseKv(value) {
  const raw = String(value || "");
  const idx = raw.indexOf("=");
  if (idx < 1) {
    throw new Error(`Expected key=value, received ${raw || "<empty>"}`);
  }
  return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
}

function parseInlineJson(value) {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed;
}

function readJsonPath(filePath) {
  const parsed = JSON.parse(readFileSync(resolve(filePath), "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object in body file.");
  }
  return parsed;
}

function coerceOutputValue(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (value === "undefined") {
    return undefined;
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  return value;
}

function flattenRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { value: row };
  }
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      value === null ||
      ["string", "number", "boolean"].includes(typeof value)
    ) {
      out[key] = value;
    }
  }
  if (Object.keys(out).length === 0) {
    out.json = JSON.stringify(row);
  }
  return out;
}

export function printOutput(payload, options = {}) {
  const meta = options.meta || {};
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, data: payload, meta }, null, 2)}\n`);
    return;
  }

  if (payload === undefined || payload === null) {
    process.stdout.write("OK\n");
    return;
  }
  if (typeof payload === "string") {
    process.stdout.write(`${payload}\n`);
    return;
  }
  if (Buffer.isBuffer(payload)) {
    process.stdout.write(`${payload.toString("utf8")}\n`);
    return;
  }

  const rows =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.events)
          ? payload.events
          : Array.isArray(payload.tools)
            ? payload.tools
            : Array.isArray(payload.apps)
              ? payload.apps
              : null;
  if (rows) {
    if (rows.length === 0) {
      process.stdout.write("(empty)\n");
      return;
    }
    console.table(rows.map((row) => flattenRow(row)));
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function loadTlsBuffer(value) {
  const filePath = String(value || "").trim();
  if (!filePath) {
    return undefined;
  }
  return readFileSync(resolve(filePath));
}

function getCookieJar(profileName) {
  const store = loadCookies();
  if (!store.profiles || typeof store.profiles !== "object") {
    store.profiles = {};
  }
  if (!store.profiles[profileName] || typeof store.profiles[profileName] !== "object") {
    store.profiles[profileName] = {};
  }
  return { store, jar: store.profiles[profileName] };
}

function parseSetCookie(headerValue) {
  const parts = String(headerValue || "").split(";").map((part) => part.trim());
  const [nameValue, ...attributes] = parts;
  const idx = nameValue.indexOf("=");
  if (idx < 1) {
    return null;
  }
  const name = nameValue.slice(0, idx);
  const value = nameValue.slice(idx + 1);
  const parsed = { name, value, path: "/", expiresAt: null };
  for (const attribute of attributes) {
    const [rawKey, rawValue = ""] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const attrValue = rawValue.trim();
    if (key === "max-age") {
      const seconds = Number.parseInt(attrValue, 10);
      if (Number.isFinite(seconds)) {
        parsed.expiresAt = Date.now() + seconds * 1000;
      }
    }
    if (key === "path" && attrValue) {
      parsed.path = attrValue;
    }
  }
  return parsed;
}

function cookieHeaderForOrigin(profileName, origin) {
  const { jar } = getCookieJar(profileName);
  const bucket = jar[origin];
  if (!bucket || typeof bucket !== "object") {
    return "";
  }
  const now = Date.now();
  const pairs = [];
  for (const [name, cookie] of Object.entries(bucket)) {
    if (!cookie || typeof cookie !== "object") {
      continue;
    }
    if (cookie.expiresAt && cookie.expiresAt < now) {
      continue;
    }
    pairs.push(`${name}=${cookie.value}`);
  }
  return pairs.join("; ");
}

function persistSetCookies(profileName, origin, headers) {
  const cookieHeaders = [];
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "set-cookie") {
      if (Array.isArray(value)) {
        cookieHeaders.push(...value);
      } else if (typeof value === "string") {
        cookieHeaders.push(value);
      }
    }
  }
  if (cookieHeaders.length === 0) {
    return;
  }
  const { store, jar } = getCookieJar(profileName);
  if (!jar[origin] || typeof jar[origin] !== "object") {
    jar[origin] = {};
  }
  for (const header of cookieHeaders) {
    const parsed = parseSetCookie(header);
    if (!parsed) {
      continue;
    }
    if (!parsed.value || parsed.expiresAt === 0) {
      delete jar[origin][parsed.name];
      continue;
    }
    jar[origin][parsed.name] = parsed;
  }
  saveCookies(store);
}

export function persistBrowserFlowCookie(profileName, origin, sessionCookie) {
  if (!sessionCookie || !sessionCookie.cookieName || !sessionCookie.cookieValue) {
    return;
  }
  const { store, jar } = getCookieJar(profileName);
  if (!jar[origin] || typeof jar[origin] !== "object") {
    jar[origin] = {};
  }
  jar[origin][sessionCookie.cookieName] = {
    name: sessionCookie.cookieName,
    value: sessionCookie.cookieValue,
    path: "/",
    expiresAt:
      sessionCookie.maxAgeSeconds && Number.isFinite(Number(sessionCookie.maxAgeSeconds))
        ? Date.now() + Number(sessionCookie.maxAgeSeconds) * 1000
        : null,
  };
  saveCookies(store);
}

function shouldPreferSessionAuth(options = {}, cookieHeader = "") {
  if (!cookieHeader) {
    return false;
  }
  if (options.admin) {
    return false;
  }
  const authMode = String(options.authMode || "session-or-api-key").trim().toLowerCase();
  if (authMode === "none" || authMode === "api-key-only") {
    return false;
  }
  return true;
}

function resolveRequestHeaders(profile, profileName, origin, options = {}) {
  const headers = {
    accept: options.accept || "application/json",
    ...(options.headers || {}),
  };
  const cookieHeader = cookieHeaderForOrigin(profileName, origin);
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  const apiKey = options.admin
    ? options.apiKey || profile.adminApiKey || profile.apiKey
    : options.apiKey || profile.apiKey;
  if (
    apiKey &&
    !headers["x-api-key"] &&
    !headers.authorization &&
    !shouldPreferSessionAuth(options, cookieHeader)
  ) {
    headers["x-api-key"] = apiKey;
  }
  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }
  return headers;
}

function createRequestOptions(url, headers, body, profile) {
  const isHttps = url.protocol === "https:";
  const options = {
    method: "GET",
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    headers,
  };
  if (isHttps) {
    options.ca = loadTlsBuffer(profile.caCert);
    options.cert = loadTlsBuffer(profile.clientCert);
    options.key = loadTlsBuffer(profile.clientKey);
    options.rejectUnauthorized = profile.insecure !== true;
  }
  if (body !== undefined && body !== null) {
    options.headers["content-length"] = Buffer.byteLength(body);
  }
  return options;
}

function finalizeResponse(profileName, origin, res, buffers) {
  const body = Buffer.concat(buffers);
  persistSetCookies(profileName, origin, res.headers);
  return {
    statusCode: res.statusCode || 0,
    headers: res.headers,
    body,
    text: body.toString("utf8"),
  };
}

export function httpRequest({
  profileName,
  profile,
  baseOrigin,
  path,
  method = "GET",
  body,
  headers,
  admin = false,
  authMode,
}) {
  const origin = normalizeOrigin(baseOrigin, DEFAULT_GATEWAY_ORIGIN);
  const url = new URL(path, origin);
  const payload =
    body === undefined || body === null
      ? null
      : Buffer.isBuffer(body)
        ? body
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
  const requestHeaders = resolveRequestHeaders(profile, profileName, origin, {
    headers,
    admin,
    authMode,
    contentType:
      payload === null
        ? undefined
        : headers?.["content-type"] || headers?.["Content-Type"] || "application/json",
  });
  const options = createRequestOptions(url, requestHeaders, payload, profile);
  options.method = method.toUpperCase();
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const buffers = [];
      res.on("data", (chunk) => buffers.push(Buffer.from(chunk)));
      res.on("end", () => resolve(finalizeResponse(profileName, origin, res, buffers)));
    });
    req.on("error", reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

export function httpSse({
  profileName,
  profile,
  baseOrigin,
  path,
  method = "GET",
  body,
  headers,
  admin = false,
  authMode,
  onEvent,
}) {
  const origin = normalizeOrigin(baseOrigin, DEFAULT_GATEWAY_ORIGIN);
  const url = new URL(path, origin);
  const payload =
    body === undefined || body === null
      ? null
      : Buffer.isBuffer(body)
        ? body
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
  const requestHeaders = resolveRequestHeaders(profile, profileName, origin, {
    headers,
    accept: "text/event-stream",
    authMode,
    contentType:
      payload === null
        ? undefined
        : headers?.["content-type"] || headers?.["Content-Type"] || "application/json",
    admin,
  });
  const options = createRequestOptions(url, requestHeaders, payload, profile);
  options.method = method.toUpperCase();
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      persistSetCookies(profileName, origin, res.headers);
      if ((res.statusCode || 0) >= 400) {
        const buffers = [];
        res.on("data", (chunk) => buffers.push(Buffer.from(chunk)));
        res.on("end", () => {
          const response = {
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(buffers),
            text: Buffer.concat(buffers).toString("utf8"),
          };
          const error = new Error(`Stream failed (${response.statusCode})`);
          error.response = response;
          reject(error);
        });
        return;
      }
      let buffer = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;
        while (buffer.includes("\n\n")) {
          const idx = buffer.indexOf("\n\n");
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = { event: "message", data: "" };
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) {
              event.event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              event.data += `${line.slice(5).trim()}\n`;
            }
          }
          event.data = event.data.trim();
          onEvent(event);
        }
      });
      res.on("end", resolve);
    });
    req.on("error", reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

export function maybeParseJson(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function assertOkResponse(response, options = {}) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return;
  }
  const payload = maybeParseJson(response.text);
  const message =
    payload?.error ||
    payload?.details ||
    payload?.message ||
    `${options.label || "Request failed"} (${response.statusCode})`;
  const error = new Error(message);
  error.response = response;
  throw error;
}

export function commandOptionValue(value, fallback = undefined) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

export function mergeBodyOptions(commandOptions = {}) {
  let body = {};
  if (commandOptions.data) {
    body = { ...body, ...parseInlineJson(commandOptions.data) };
  }
  if (commandOptions.bodyFile) {
    body = { ...body, ...readJsonPath(commandOptions.bodyFile) };
  }
  for (const pair of commandOptions.bodyPatch || []) {
    const [key, rawValue] = parseKv(pair);
    body[key] = coerceOutputValue(rawValue);
  }
  return body;
}

export function mergeQueryOptions(commandOptions = {}) {
  const query = new URLSearchParams();
  for (const pair of commandOptions.query || []) {
    const [key, value] = parseKv(pair);
    query.set(key, value);
  }
  return query;
}

export function applyExtraHeaders(headers, commandOptions = {}) {
  for (const pair of commandOptions.header || []) {
    const [key, value] = parseKv(pair);
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

export function originForBase(profile, base) {
  return base === "admin" ? profile.adminOrigin || profile.gatewayOrigin : profile.gatewayOrigin;
}

export async function openBrowser(url) {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args =
    platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => resolve(false));
    child.unref();
    resolve(true);
  });
}

export function flattenOptionsArray(values) {
  return Array.isArray(values) ? values : values ? [values] : [];
}
