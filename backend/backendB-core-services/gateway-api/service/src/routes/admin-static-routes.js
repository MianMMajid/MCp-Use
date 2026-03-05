import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

const CONTENT_TYPES = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp"]);
const STATIC_CACHE_HEADERS = {
  "cache-control": "public, max-age=3600",
};

function envOrDefault(name, fallback) {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  return parsed.toString().replace(/\/+$/, "");
}

const frontendAUrl = normalizeBaseUrl(envOrDefault("MAPLE_FRONTEND_A_URL", "http://127.0.0.1:4101"));
const frontendCUrl = normalizeBaseUrl(envOrDefault("MAPLE_FRONTEND_C_URL", "http://127.0.0.1:4103"));

function resolvePublicPath(filename) {
  return [
    resolve(process.cwd(), "public", filename),
    resolve(process.cwd(), "dist", "public", filename),
    resolve(import.meta.dirname, "../../public", filename),
  ];
}

async function readAsset(filename, encoding = undefined) {
  for (const candidate of resolvePublicPath(filename)) {
    try {
      return await readFile(candidate, encoding);
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Public asset not found: ${filename}`);
}

function textAssetResponse(body, contentType) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType, ...STATIC_CACHE_HEADERS },
  });
}

function binaryAssetResponse(body, contentType) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType, ...STATIC_CACHE_HEADERS },
  });
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValidSessionCookie(cookieHeader) {
  if (!cookieHeader) {
    return false;
  }
  const sessionCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("maple_session="));
  if (!sessionCookie) {
    return false;
  }
  const value = sessionCookie.slice("maple_session=".length).trim();
  if (value.length < 36) {
    return false;
  }
  return UUID_V4_REGEX.test(value);
}

function toFrontendUrl(baseUrl, path = "/") {
  const safePath = String(path || "/").startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${safePath}`;
}

function judgeRedirectLocation(cookieHeader) {
  if (hasValidSessionCookie(cookieHeader)) {
    return toFrontendUrl(frontendAUrl, "/");
  }
  const next = encodeURIComponent(toFrontendUrl(frontendAUrl, "/"));
  return toFrontendUrl(frontendCUrl, `/login?next=${next}`);
}

export function createAdminStaticRoutes() {
  const app = new Hono();

  // Canonical frontend entrypoints now live in template runtimes.
  app.get("/", (c) => c.redirect(toFrontendUrl(frontendCUrl, "/"), 302));
  app.get("/landing", (c) => c.redirect(toFrontendUrl(frontendCUrl, "/"), 302));
  app.get("/judge", (c) => c.redirect(judgeRedirectLocation(c.req.header("cookie")), 302));

  // Keep small static assets here for compatibility.
  app.get("/logo.png", async (c) => {
    try {
      const png = await readAsset("logo.png");
      const body = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
      return binaryAssetResponse(body, "image/png");
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Unable to load logo.", 500);
    }
  });

  app.get("/favicon.ico", async (c) => {
    try {
      const ico = await readAsset("favicon.ico");
      const body = ico.buffer.slice(ico.byteOffset, ico.byteOffset + ico.byteLength);
      return binaryAssetResponse(body, "image/x-icon");
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Unable to load favicon.", 500);
    }
  });

  app.get("/icon.svg", async (c) => {
    try {
      const svg = await readAsset("icon.svg", "utf8");
      return textAssetResponse(svg, "image/svg+xml");
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Unable to load icon.", 500);
    }
  });

  app.get("/robots.txt", async (c) => {
    try {
      const robots = await readAsset("robots.txt", "utf8");
      return textAssetResponse(robots, "text/plain; charset=utf-8");
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Unable to load robots.txt.", 500);
    }
  });

  app.get("/sitemap.xml", async (c) => {
    try {
      const sitemap = await readAsset("sitemap.xml", "utf8");
      return textAssetResponse(sitemap, "application/xml; charset=utf-8");
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Unable to load sitemap.xml.", 500);
    }
  });

  app.get("/assets/:filename", async (c) => {
    const filename = c.req.param("filename");
    if (filename.includes("..") || filename.includes("/")) {
      return c.text("Invalid filename", 400);
    }
    const ext = extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      return c.text("Unsupported file type", 415);
    }

    try {
      const asset = await readAsset(filename, BINARY_EXTENSIONS.has(ext) ? undefined : "utf8");
      if (BINARY_EXTENSIONS.has(ext)) {
        const body = asset.buffer.slice(asset.byteOffset, asset.byteOffset + asset.byteLength);
        return binaryAssetResponse(body, contentType);
      }
      return textAssetResponse(asset, contentType);
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Asset not found.", 404);
    }
  });

  return app;
}
