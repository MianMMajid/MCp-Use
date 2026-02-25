interface RequireApiKeyContext {
  req: {
    method: string;
  };
  res?: {
    headers?: {
      get: (name: string) => string | null;
    };
  };
}

interface RegisterMcpTransportRoutesDeps {
  allowNoAuth: boolean;
  handleMcpFirewallProxy: (c: any) => Promise<Response | undefined>;
  requireApiKeyResponse: (
    c: any,
    options?: { allowSession?: boolean; requireApiKey?: boolean }
  ) => Response | undefined;
}

interface McpTransportRegistrar {
  use: (
    path: string,
    handler: (c: any, next: () => Promise<void>) => Promise<Response | void>
  ) => void;
}

function jsonRpcNotInitializedResponse(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: Server not initialized" },
      id: null,
    }),
    {
      status: 400,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers":
          "Content-Type, Accept, Authorization, mcp-protocol-version, mcp-session-id",
        "access-control-expose-headers": "mcp-session-id",
      },
    }
  );
}

function forceSseAcceptHeader(c: any): void {
  try {
    c.req.raw.headers.set("Accept", "text/event-stream");
    return;
  } catch {
    // fall through to request replacement
  }

  try {
    const newHeaders = new Headers();
    for (const [key, value] of c.req.raw.headers.entries()) {
      if (key.toLowerCase() !== "accept") {
        newHeaders.append(key, value);
      }
    }
    newHeaders.set("Accept", "text/event-stream");
    c.req.raw = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: newHeaders,
    });
  } catch {
    // leave as-is; fallback response conversion handles HTML misclassification
  }
}

function hasHtmlContentType(c: RequireApiKeyContext): boolean {
  const contentType = c.res?.headers?.get("content-type") || "";
  return contentType.includes("text/html");
}

export function registerMcpTransportRoutes(
  app: McpTransportRegistrar,
  deps: RegisterMcpTransportRoutesDeps
): void {
  for (const endpoint of ["/mcp", "/sse"] as const) {
    app.use(endpoint, async (c, next) => {
      if (c.req.method === "GET") {
        forceSseAcceptHeader(c);
      }

      await next();

      if (hasHtmlContentType(c)) {
        c.res = jsonRpcNotInitializedResponse();
      }
    });
  }

  app.use("/mcp", async (c, next) => {
    const unauthorized = deps.requireApiKeyResponse(c, {
      allowSession: false,
      requireApiKey: !deps.allowNoAuth,
    });
    if (unauthorized) {
      return unauthorized;
    }

    if (c.req.method === "POST") {
      const proxied = await deps.handleMcpFirewallProxy(c);
      if (proxied) {
        return proxied;
      }
    }

    await next();
  });

  app.use("/sse", async (c, next) => {
    const unauthorized = deps.requireApiKeyResponse(c, {
      allowSession: false,
      requireApiKey: !deps.allowNoAuth,
    });
    if (unauthorized) {
      return unauthorized;
    }

    await next();
  });
}
