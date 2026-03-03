import { requireApiKeyResponse } from "../auth.js";
import { database, server } from "../state.js";

function replacementFor(pathname) {
  if (pathname.endsWith("/summary")) return "/api/observability/orchestrations/summary";
  if (pathname.endsWith("/slo")) return "/api/observability/orchestrations/slo";
  if (pathname.endsWith("/audit-log")) return "/api/observability/orchestrations/audit-log";
  if (pathname.endsWith("/siem-export")) return "/api/observability/orchestrations/export";
  if (pathname.endsWith("/flush")) return "/api/observability/orchestrations/flush";
  if (pathname.endsWith("/org")) return "/api/operations/orchestrations/escalation";
  return "/api/observability/orchestrations/summary";
}

async function gone(c) {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) return unauthorized;
  const pathname = c.req.path;
  return c.json(
    {
      ok: false,
      error: "Endpoint removed",
      replacement: replacementFor(pathname),
    },
    410,
  );
}

server.app.get("/api/openclaw/modifier/observability/*", gone);
server.app.post("/api/openclaw/modifier/observability/*", gone);
server.app.put("/api/openclaw/modifier/observability/*", gone);
server.app.patch("/api/openclaw/modifier/observability/*", gone);
server.app.delete("/api/openclaw/modifier/observability/*", gone);
server.app.get("/api/openclaw/modifier/observability", gone);
server.app.post("/api/openclaw/modifier/observability", gone);
server.app.put("/api/openclaw/modifier/observability", gone);
server.app.patch("/api/openclaw/modifier/observability", gone);
server.app.delete("/api/openclaw/modifier/observability", gone);
