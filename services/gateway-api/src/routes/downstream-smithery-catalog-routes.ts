import { server, database } from "../state.js";
import {
  smitheryEnabled,
  smitheryApiBaseUrl,
  smitheryApiKey,
  smitheryTimeoutMs,
} from "../config.js";
import { requireApiKeyResponse } from "../auth.js";
import {
  asString,
  asNumber,
  errorMessage,
  withAbortTimeout,
} from "../helpers.js";
import {
  fetchSmitheryServerDetails,
  listSmitheryServers,
  resolveSmitheryDeploymentUrl,
} from "../integrations/smithery.js";

export function registerSmitheryCatalogRoutes(app: typeof server.app) {
  app.get("/api/smithery/servers", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    if (!smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400,
      );
    }

    const page = asNumber(c.req.query("page"));
    const pageSize = asNumber(c.req.query("pageSize"));
    const query = asString(c.req.query("q")) ?? asString(c.req.query("query"));
    const remote = asString(c.req.query("remote"));
    const verified = asString(c.req.query("verified"));
    const deployed = asString(c.req.query("deployed"));

    try {
      const data = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
        listSmitheryServers({
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
          page: page ? Math.max(1, Math.trunc(page)) : 1,
          pageSize: pageSize ? Math.max(1, Math.min(100, Math.trunc(pageSize))) : 20,
          query,
          remote: remote ? remote.toLowerCase() === "true" : undefined,
          verified: verified ? verified.toLowerCase() === "true" : undefined,
          deployed: deployed ? deployed.toLowerCase() === "true" : undefined,
        }),
      );

      return c.json({
        source: "smithery",
        apiBaseUrl: smitheryApiBaseUrl,
        count: data.servers.length,
        pagination: data.pagination ?? null,
        servers: data.servers,
      });
    } catch (error) {
      return c.json(
        {
          error: "Failed to fetch Smithery servers.",
          detail: errorMessage(error),
        },
        502,
      );
    }
  });

  app.get("/api/smithery/server", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    if (!smitheryEnabled) {
      return c.json(
        {
          error: "Smithery integration is disabled.",
          hint: "Set MAPLE_SMITHERY_ENABLED=true.",
        },
        400,
      );
    }

    const qualifiedName = asString(c.req.query("qualifiedName")) ?? asString(c.req.query("server"));
    if (!qualifiedName) {
      return c.json(
        {
          error: "qualifiedName query parameter is required.",
        },
        400,
      );
    }

    try {
      const detail = await withAbortTimeout(smitheryTimeoutMs, (signal) =>
        fetchSmitheryServerDetails(qualifiedName, {
          apiBaseUrl: smitheryApiBaseUrl,
          apiKey: smitheryApiKey,
          signal,
        }),
      );
      const deploymentUrl = resolveSmitheryDeploymentUrl(detail);
      return c.json({
        source: "smithery",
        apiBaseUrl: smitheryApiBaseUrl,
        server: detail,
        deploymentUrl: deploymentUrl ?? null,
      });
    } catch (error) {
      return c.json(
        {
          error: `Failed to resolve Smithery server "${qualifiedName}".`,
          detail: errorMessage(error),
        },
        502,
      );
    }
  });
}
