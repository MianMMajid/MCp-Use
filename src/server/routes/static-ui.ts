import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { server, database } from "../state.js";
import { judgeUiRoutesEnabled } from "../config.js";
import { findRequestSession } from "../auth.js";

// ── Asset helpers ────────────────────────────────────────────────────────────

async function readJudgeAsset(
  filename:
    | "judges.html"
    | "judges.css"
    | "judges.js"
    | "judges-app.js"
    | "judges-auth.js"
    | "judges-http.js"
    | "landing.html"
    | "landing.css"
    | "landing.js"
    | "maple-tokens.css"
) {
  const candidates = [
    resolve(process.cwd(), "public", filename),
    resolve(process.cwd(), "dist", "public", filename),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Public asset not found: ${filename}`);
}

async function readJudgeBinaryAsset(filename: "logo.png") {
  const candidates = [
    resolve(process.cwd(), "public", filename),
    resolve(process.cwd(), "dist", "public", filename),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Public binary asset not found: ${filename}`);
}

// ── Landing / static asset routes (judge UI enabled) ─────────────────────────

if (judgeUiRoutesEnabled) {
  server.get("/", async (c) => {
    try {
      const html = await readJudgeAsset("landing.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing page.",
        500
      );
    }
  });

  server.get("/landing", async (c) => {
    try {
      const html = await readJudgeAsset("landing.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing page.",
        500
      );
    }
  });

  server.get("/landing.css", async (c) => {
    try {
      const css = await readJudgeAsset("landing.css");
      return c.body(css, 200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing css.",
        500
      );
    }
  });

  server.get("/maple-tokens.css", async (c) => {
    try {
      const css = await readJudgeAsset("maple-tokens.css");
      return c.body(css, 200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load maple tokens css.",
        500
      );
    }
  });

  server.get("/landing.js", async (c) => {
    try {
      const js = await readJudgeAsset("landing.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load landing js.",
        500
      );
    }
  });

  server.get("/logo.png", async (c) => {
    try {
      const png = await readJudgeBinaryAsset("logo.png");
      return c.body(png, 200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load logo image.",
        500
      );
    }
  });
}

// ── Health route ─────────────────────────────────────────────────────────────

server.get("/health", (c) =>
  c.json({
    ok: true,
    name: "maple",
    version: "1.0.2",
    timestamp: new Date().toISOString(),
  })
);

// ── Authenticated judge UI routes ────────────────────────────────────────────

if (judgeUiRoutesEnabled) {
  const redirectToLandingWhenUnauthenticated = async (
    c: {
      req: { header: (name: string) => string | undefined };
      redirect: (location: string, status?: 301 | 302 | 303 | 307 | 308 | undefined) => Response;
    },
    nextPath: string
  ): Promise<Response | undefined> => {
    const session = await findRequestSession(database, c.req.header("cookie"));
    if (session) {
      return undefined;
    }
    const target = `/landing?next=${encodeURIComponent(nextPath)}`;
    return c.redirect(target, 302);
  };

  server.get("/judge", async (c) => {
    const redirect = await redirectToLandingWhenUnauthenticated(c, "/judge");
    if (redirect) {
      return redirect;
    }
    try {
      const html = await readJudgeAsset("judges.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge page.",
        500
      );
    }
  });

  server.get("/judges.html", async (c) => {
    const redirect = redirectToLandingWhenUnauthenticated(c, "/judge");
    if (redirect) {
      return redirect;
    }
    try {
      const html = await readJudgeAsset("judges.html");
      return c.body(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge page.",
        500
      );
    }
  });

  server.get("/judges.css", async (c) => {
    try {
      const css = await readJudgeAsset("judges.css");
      return c.body(css, 200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge css.",
        500
      );
    }
  });

  server.get("/judges.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge js.",
        500
      );
    }
  });

  server.get("/judges-app.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges-app.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge app js.",
        500
      );
    }
  });

  server.get("/judges-auth.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges-auth.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge auth js.",
        500
      );
    }
  });

  server.get("/judges-http.js", async (c) => {
    try {
      const js = await readJudgeAsset("judges-http.js");
      return c.body(js, 200, {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
      });
    } catch (assetError) {
      return c.text(
        assetError instanceof Error ? assetError.message : "Unable to load judge http js.",
        500
      );
    }
  });
}

// ── Inspector demo route ─────────────────────────────────────────────────────

server.get("/inspector/demo", async (c) => {
  const requestUrl = new URL(c.req.url);
  const host =
    requestUrl.hostname === "0.0.0.0" || requestUrl.hostname === "::"
      ? "localhost"
      : requestUrl.hostname;
  const base = `${requestUrl.protocol}//${host}${requestUrl.port ? `:${requestUrl.port}` : ""}`;
  const mcpUrl = new URL("/mcp", base);

  const target = `/inspector?autoConnect=${encodeURIComponent(mcpUrl.toString())}`;
  return c.redirect(target, 302);
});
