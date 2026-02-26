import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const staticRoot = resolve(
  __dirname,
  "../../../frontend/frontendC-marketing-download-site/public"
);
const host = "127.0.0.1";
const port = Number(process.env.PLAYWRIGHT_TEST_PORT ?? 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function serveStaticPath(res, pathname) {
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(staticRoot, normalizedPath));
  if (!absolutePath.startsWith(staticRoot)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const body = await readFile(absolutePath);
    const extension = extname(absolutePath).toLowerCase();
    const contentType = contentTypes.get(extension) ?? "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const requestUrl = new URL(req.url ?? "/", `http://${host}:${port}`);
  const pathname = requestUrl.pathname;

  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && (pathname === "/" || pathname === "/landing" || pathname === "/landing.html")) {
    await serveStaticPath(res, "landing.html");
    return;
  }

  if (method === "GET" && pathname.startsWith("/judge")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="en"><body><h1 data-testid="judge-home">Judge Dashboard</h1><p data-testid="judge-path">${pathname}</p></body></html>`);
    return;
  }

  if (method === "GET" && pathname === "/api/auth/google/client-id") {
    sendJson(res, 200, { clientId: "" });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const payload = await readJsonBody(req);
    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    if (!username || !password) {
      sendJson(res, 400, { ok: false, error: "Invalid username or password." });
      return;
    }
    if (username === "denied_user") {
      sendJson(res, 401, { ok: false, error: "Invalid username or password." });
      return;
    }
    sendJson(res, 200, { ok: true, user: { username } });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    const payload = await readJsonBody(req);
    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    const email = String(payload.email ?? "").trim();

    if (!username || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      sendJson(res, 400, { ok: false, error: "Invalid input. Check your fields." });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { ok: false, error: "Invalid input. Check your fields." });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { ok: false, error: "Invalid input. Check your fields." });
      return;
    }
    if (username === "taken_user") {
      sendJson(res, 409, { ok: false, error: "Username is already taken." });
      return;
    }
    sendJson(res, 200, { ok: true, user: { username } });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/google") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET") {
    await serveStaticPath(res, pathname.slice(1));
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  process.stdout.write(`[frontend-e2e-server] listening on http://${host}:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
