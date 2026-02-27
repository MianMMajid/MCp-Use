#!/usr/bin/env node

import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

function parseArgs(argv) {
  const envProxyPrefixes = String(process.env.STATIC_PROXY_PREFIXES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const envProxyInsecure =
    String(process.env.STATIC_PROXY_INSECURE ?? "0").trim().toLowerCase() === "1" ||
    String(process.env.STATIC_PROXY_INSECURE ?? "0").trim().toLowerCase() === "true";
  const args = {
    root: process.cwd(),
    port: Number.parseInt(process.env.PORT ?? "8080", 10),
    index: process.env.STATIC_INDEX ?? "",
    proxyTarget: process.env.STATIC_PROXY_TARGET ?? "",
    proxyPrefixes: envProxyPrefixes,
    proxyInsecure: envProxyInsecure,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if (current === "--root" && next) {
      args.root = next;
      i += 1;
      continue;
    }
    if (current === "--port" && next) {
      const parsed = Number.parseInt(next, 10);
      args.port = Number.isFinite(parsed) ? parsed : args.port;
      i += 1;
      continue;
    }
    if (current === "--index" && next) {
      args.index = next;
      i += 1;
      continue;
    }
    if (current === "--proxy-target" && next) {
      args.proxyTarget = next;
      i += 1;
      continue;
    }
    if (current === "--proxy-prefix" && next) {
      args.proxyPrefixes.push(next);
      i += 1;
      continue;
    }
    if (current === "--proxy-insecure") {
      args.proxyInsecure = true;
      continue;
    }
  }

  return {
    root: resolve(args.root),
    port: Number.isFinite(args.port) ? args.port : 8080,
    index: args.index,
    proxyTarget: String(args.proxyTarget ?? "").trim(),
    proxyPrefixes: [...new Set(args.proxyPrefixes.map((entry) => entry.trim()).filter((entry) => entry.length > 0))],
    proxyInsecure: args.proxyInsecure,
  };
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
};

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function normalizeRequestPath(requestPath) {
  const decoded = decodeURIComponent(requestPath || "/");
  const cleaned = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return cleaned.startsWith("/") ? cleaned.slice(1) : cleaned;
}

async function sendDirectoryListing(res, absolutePath, basePath) {
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const links = entries
    .map((entry) => {
      const name = entry.name;
      const suffix = entry.isDirectory() ? "/" : "";
      return `<li><a href="${basePath}${name}${suffix}">${name}${suffix}</a></li>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Directory listing</title></head>
<body>
  <h1>Directory listing</h1>
  <ul>${links}</ul>
</body>
</html>`;
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
}

function streamFile(res, absolutePath) {
  const extension = extname(absolutePath).toLowerCase();
  const contentType = MIME_TYPES[extension] ?? "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", contentType);
  createReadStream(absolutePath).pipe(res);
}

function pathMatchesProxyPrefix(pathname, proxyPrefixes) {
  for (const prefix of proxyPrefixes) {
    const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
    if (pathname === normalized || pathname.startsWith(`${normalized}/`)) {
      return true;
    }
  }
  return false;
}

async function proxyRequest(req, res, sourceUrl, config) {
  if (!config.proxyTarget) {
    sendJson(res, 502, { ok: false, error: "Proxy target is not configured." });
    return;
  }
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, config.proxyTarget);
  const method = String(req.method ?? "GET").toUpperCase();
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") {
      continue;
    }
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") {
      continue;
    }
    headers[key] = value;
  }
  headers["x-forwarded-host"] = String(req.headers.host ?? "");
  headers["x-forwarded-proto"] = "http";
  headers["x-forwarded-for"] = String(req.socket.remoteAddress ?? "");
  const isHttps = targetUrl.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  try {
    const upstream = requestFn({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      method,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers,
      ...(isHttps ? { rejectUnauthorized: !config.proxyInsecure } : {}),
    }, (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode ?? 502;
      for (const [headerName, headerValue] of Object.entries(upstreamRes.headers)) {
        if (headerName.toLowerCase() === "transfer-encoding") {
          continue;
        }
        if (typeof headerValue !== "undefined") {
          res.setHeader(headerName, headerValue);
        }
      }
      upstreamRes.pipe(res);
    });
    upstream.on("error", (error) => {
      sendJson(res, 502, {
        ok: false,
        error: "Proxy request failed",
        details: error instanceof Error ? error.message : String(error),
      });
    });
    if (method === "GET" || method === "HEAD") {
      upstream.end();
      return;
    }
    req.pipe(upstream);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: "Proxy request failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

const config = parseArgs(process.argv);
const root = config.root;
const indexFile = config.index;
if (!existsSync(root)) {
  console.error(`Static root does not exist: ${root}`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      root,
      index: indexFile || null,
      proxyTarget: config.proxyTarget || null,
      proxyPrefixes: config.proxyPrefixes,
      proxyInsecure: config.proxyInsecure,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (config.proxyTarget && pathMatchesProxyPrefix(url.pathname, config.proxyPrefixes)) {
    await proxyRequest(req, res, url, config);
    return;
  }

  const relativePath = normalizeRequestPath(url.pathname);
  let absolutePath = resolve(join(root, relativePath));

  if (!absolutePath.startsWith(root)) {
    sendJson(res, 403, { ok: false, error: "Forbidden path" });
    return;
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    if (indexFile) {
      const candidate = join(absolutePath, indexFile);
      if (existsSync(candidate)) {
        streamFile(res, candidate);
        return;
      }
    }
    await sendDirectoryListing(res, absolutePath, url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`);
    return;
  }

  if (!existsSync(absolutePath) && indexFile) {
    const fallback = join(root, indexFile);
    if (existsSync(fallback)) {
      streamFile(res, fallback);
      return;
    }
  }

  if (!existsSync(absolutePath)) {
    sendJson(res, 404, { ok: false, error: "Not found", path: url.pathname });
    return;
  }

  streamFile(res, absolutePath);
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Static server listening on 0.0.0.0:${config.port}`);
  console.log(`Root: ${root}`);
  console.log(`Index: ${indexFile || "(none)"}`);
  console.log(`Proxy target: ${config.proxyTarget || "(disabled)"}`);
  console.log(
    `Proxy prefixes: ${config.proxyPrefixes.length > 0 ? config.proxyPrefixes.join(", ") : "(none)"}`
  );
  console.log(`Proxy insecure TLS: ${config.proxyInsecure ? "enabled" : "disabled"}`);
});
