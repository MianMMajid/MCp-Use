#!/usr/bin/env node

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    port: Number.parseInt(process.env.PORT ?? "8080", 10),
    index: process.env.STATIC_INDEX ?? "",
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
  }

  return {
    root: resolve(args.root),
    port: Number.isFinite(args.port) ? args.port : 8080,
    index: args.index,
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
    sendJson(res, 200, { ok: true, root, index: indexFile || null, timestamp: new Date().toISOString() });
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
});
