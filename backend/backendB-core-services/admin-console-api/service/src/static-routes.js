import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
// ── Asset helpers ────────────────────────────────────────────────────────────
const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
};
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp"]);
function resolvePublicPath(filename) {
    return [
        resolve(process.cwd(), "public", filename),
        resolve(process.cwd(), "dist", "public", filename),
        resolve(import.meta.dirname, "../../public", filename),
    ];
}
async function readTextAsset(filename) {
    for (const candidate of resolvePublicPath(filename)) {
        try {
            return await readFile(candidate, "utf8");
        }
        catch {
            // try next candidate
        }
    }
    throw new Error(`Public asset not found: ${filename}`);
}
async function readBinaryAsset(filename) {
    for (const candidate of resolvePublicPath(filename)) {
        try {
            const buf = await readFile(candidate);
            // Copy into a standalone ArrayBuffer to satisfy Hono/Response types
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
        catch {
            // try next candidate
        }
    }
    throw new Error(`Public binary asset not found: ${filename}`);
}
// ── Cache headers ────────────────────────────────────────────────────────────
const NO_CACHE_HEADERS = {
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    expires: "0",
};
const STATIC_CACHE_HEADERS = {
    "cache-control": "public, max-age=3600",
};
// ── Response helpers ─────────────────────────────────────────────────────────
function textAssetResponse(body, contentType, cacheHeaders) {
    return new Response(body, {
        status: 200,
        headers: { "content-type": contentType, ...cacheHeaders },
    });
}
function binaryAssetResponse(body, contentType, cacheHeaders) {
    return new Response(body, {
        status: 200,
        headers: { "content-type": contentType, ...cacheHeaders },
    });
}
// ── Session check ────────────────────────────────────────────────────────────
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function hasValidSessionCookie(cookieHeader) {
    if (!cookieHeader)
        return false;
    const sessionCookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("maple_session="));
    if (!sessionCookie)
        return false;
    const value = sessionCookie.slice("maple_session=".length).trim();
    if (value.length < 36)
        return false;
    return UUID_V4_REGEX.test(value);
}
// ── Routes ───────────────────────────────────────────────────────────────────
export function createStaticRoutes() {
    const app = new Hono();
    // Root redirects to landing
    app.get("/", (c) => c.redirect("/landing", 302));
    // Landing page (public)
    app.get("/landing", async (c) => {
        try {
            const html = await readTextAsset("landing.html");
            return textAssetResponse(html, "text/html; charset=utf-8", NO_CACHE_HEADERS);
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Unable to load landing page.", 500);
        }
    });
    // Judge dashboard (auth required)
    app.get("/judge", async (c) => {
        const cookie = c.req.header("cookie");
        if (!hasValidSessionCookie(cookie)) {
            return c.redirect(`/landing?next=${encodeURIComponent("/judge")}`, 302);
        }
        try {
            const html = await readTextAsset("judges.html");
            return textAssetResponse(html, "text/html; charset=utf-8", NO_CACHE_HEADERS);
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Unable to load judge page.", 500);
        }
    });
    // Also serve /judges.html with auth
    app.get("/judges.html", async (c) => {
        const cookie = c.req.header("cookie");
        if (!hasValidSessionCookie(cookie)) {
            return c.redirect(`/landing?next=${encodeURIComponent("/judge")}`, 302);
        }
        try {
            const html = await readTextAsset("judges.html");
            return textAssetResponse(html, "text/html; charset=utf-8", NO_CACHE_HEADERS);
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Unable to load judge page.", 500);
        }
    });
    // CSS files
    for (const cssFile of ["landing.css", "judges.css", "maple-tokens.css"]) {
        app.get(`/${cssFile}`, async (c) => {
            try {
                const css = await readTextAsset(cssFile);
                return textAssetResponse(css, "text/css; charset=utf-8", NO_CACHE_HEADERS);
            }
            catch (err) {
                return c.text(err instanceof Error ? err.message : `Unable to load ${cssFile}.`, 500);
            }
        });
    }
    // JS files
    for (const jsFile of ["landing.js", "judges.js", "judges-auth.js", "judges-http.js"]) {
        app.get(`/${jsFile}`, async (c) => {
            try {
                const js = await readTextAsset(jsFile);
                return textAssetResponse(js, "application/javascript; charset=utf-8", NO_CACHE_HEADERS);
            }
            catch (err) {
                return c.text(err instanceof Error ? err.message : `Unable to load ${jsFile}.`, 500);
            }
        });
    }
    // Logo
    app.get("/logo.png", async (c) => {
        try {
            const png = await readBinaryAsset("logo.png");
            return binaryAssetResponse(png, "image/png", STATIC_CACHE_HEADERS);
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Unable to load logo.", 500);
        }
    });
    // Favicon
    app.get("/favicon.ico", async (c) => {
        try {
            const ico = await readBinaryAsset("favicon.ico");
            return binaryAssetResponse(ico, "image/x-icon", STATIC_CACHE_HEADERS);
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Unable to load favicon.", 500);
        }
    });
    // Icon SVG
    app.get("/icon.svg", async (c) => {
        try {
            const svg = await readTextAsset("icon.svg");
            return textAssetResponse(svg, "image/svg+xml", STATIC_CACHE_HEADERS);
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Unable to load icon.", 500);
        }
    });
    // Fruit images (served from public/fruits/*.png)
    app.get("/fruits/:filename", async (c) => {
        const filename = c.req.param("filename");
        // Prevent directory traversal
        if (filename.includes("..") || filename.includes("/")) {
            return c.text("Invalid filename", 400);
        }
        const ext = extname(filename).toLowerCase();
        const contentType = CONTENT_TYPES[ext];
        if (!contentType) {
            return c.text("Unsupported file type", 415);
        }
        try {
            const isBinary = BINARY_EXTENSIONS.has(ext);
            if (isBinary) {
                const data = await readBinaryAsset(`fruits/${filename}`);
                return binaryAssetResponse(data, contentType, STATIC_CACHE_HEADERS);
            }
            else {
                const data = await readTextAsset(`fruits/${filename}`);
                return textAssetResponse(data, contentType, STATIC_CACHE_HEADERS);
            }
        }
        catch (err) {
            return c.text(err instanceof Error ? err.message : "Asset not found.", 404);
        }
    });
    return app;
}
//# sourceMappingURL=static-routes.js.map