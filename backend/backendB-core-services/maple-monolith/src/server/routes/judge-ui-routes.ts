import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JudgeTextAssetName =
  | "judges.html"
  | "judges.css"
  | "judges.js"
  | "judges-app.js"
  | "judges-auth.js"
  | "judges-http.js"
  | "landing.html"
  | "landing.css"
  | "landing.js";

type JudgeBinaryAssetName = "logo.png";

interface JudgeRouteContext {
  req: {
    header: (name: string) => string | undefined;
  };
  body: (
    content: unknown,
    status?: number,
    headers?: Record<string, string>
  ) => Response;
  text: (content: string, status?: number) => Response;
  redirect: (
    location: string,
    status?: 301 | 302 | 303 | 307 | 308
  ) => Response;
}

type JudgeRouteHandler = (c: JudgeRouteContext) => Response | Promise<Response>;

interface JudgeRouteRegistrar {
  get: (path: string, handler: JudgeRouteHandler) => void;
}

interface RegisterJudgeUiRoutesDeps {
  enabled: boolean;
  findRequestSession: (cookieHeader?: string) => unknown | Promise<unknown>;
  readTextAsset?: (filename: JudgeTextAssetName) => Promise<string>;
  readBinaryAsset?: (filename: JudgeBinaryAssetName) => Promise<Uint8Array>;
}

const NO_STORE_HEADERS: Record<string, string> = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  expires: "0",
};

async function defaultReadTextAsset(filename: JudgeTextAssetName): Promise<string> {
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

async function defaultReadBinaryAsset(filename: JudgeBinaryAssetName): Promise<Uint8Array> {
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

async function serveTextAsset(
  c: JudgeRouteContext,
  readTextAsset: (filename: JudgeTextAssetName) => Promise<string>,
  filename: JudgeTextAssetName,
  contentType: string,
  fallbackError: string
): Promise<Response> {
  try {
    const content = await readTextAsset(filename);
    return c.body(content, 200, {
      "content-type": contentType,
      ...NO_STORE_HEADERS,
    });
  } catch (assetError) {
    return c.text(assetError instanceof Error ? assetError.message : fallbackError, 500);
  }
}

async function serveBinaryAsset(
  c: JudgeRouteContext,
  readBinaryAsset: (filename: JudgeBinaryAssetName) => Promise<Uint8Array>,
  filename: JudgeBinaryAssetName,
  contentType: string,
  fallbackError: string
): Promise<Response> {
  try {
    const content = await readBinaryAsset(filename);
    return c.body(content, 200, {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
    });
  } catch (assetError) {
    return c.text(assetError instanceof Error ? assetError.message : fallbackError, 500);
  }
}

export function registerJudgeUiRoutes(
  server: JudgeRouteRegistrar,
  deps: RegisterJudgeUiRoutesDeps
): void {
  if (!deps.enabled) {
    return;
  }

  const readTextAsset = deps.readTextAsset ?? defaultReadTextAsset;
  const readBinaryAsset = deps.readBinaryAsset ?? defaultReadBinaryAsset;

  const requireSession = async (
    c: JudgeRouteContext,
    nextPath: string
  ): Promise<Response | undefined> => {
    const session = await deps.findRequestSession(c.req.header("cookie"));
    if (session) {
      return undefined;
    }
    const target = `/landing?next=${encodeURIComponent(nextPath)}`;
    return c.redirect(target, 302);
  };

  server.get("/", (c) =>
    serveTextAsset(c, readTextAsset, "landing.html", "text/html; charset=utf-8", "Unable to load landing page.")
  );
  server.get("/landing", (c) =>
    serveTextAsset(c, readTextAsset, "landing.html", "text/html; charset=utf-8", "Unable to load landing page.")
  );
  server.get("/landing.css", (c) =>
    serveTextAsset(c, readTextAsset, "landing.css", "text/css; charset=utf-8", "Unable to load landing css.")
  );
  server.get("/landing.js", (c) =>
    serveTextAsset(c, readTextAsset, "landing.js", "application/javascript; charset=utf-8", "Unable to load landing js.")
  );

  server.get("/logo.png", (c) =>
    serveBinaryAsset(c, readBinaryAsset, "logo.png", "image/png", "Unable to load logo image.")
  );

  server.get("/judge", async (c) => {
    const redirect = await requireSession(c, "/judge");
    if (redirect) {
      return redirect;
    }
    return serveTextAsset(c, readTextAsset, "judges.html", "text/html; charset=utf-8", "Unable to load judge page.");
  });

  server.get("/judges.html", async (c) => {
    const redirect = await requireSession(c, "/judge");
    if (redirect) {
      return redirect;
    }
    return serveTextAsset(c, readTextAsset, "judges.html", "text/html; charset=utf-8", "Unable to load judge page.");
  });

  server.get("/judges.css", (c) =>
    serveTextAsset(c, readTextAsset, "judges.css", "text/css; charset=utf-8", "Unable to load judge css.")
  );
  server.get("/judges.js", (c) =>
    serveTextAsset(c, readTextAsset, "judges.js", "application/javascript; charset=utf-8", "Unable to load judge js.")
  );
  server.get("/judges-app.js", (c) =>
    serveTextAsset(c, readTextAsset, "judges-app.js", "application/javascript; charset=utf-8", "Unable to load judge app js.")
  );
  server.get("/judges-auth.js", (c) =>
    serveTextAsset(c, readTextAsset, "judges-auth.js", "application/javascript; charset=utf-8", "Unable to load judge auth js.")
  );
  server.get("/judges-http.js", (c) =>
    serveTextAsset(c, readTextAsset, "judges-http.js", "application/javascript; charset=utf-8", "Unable to load judge http js.")
  );
}
