import { requireApiKeyResponse } from "../auth.js";
import { database, server } from "../state.js";

function replacementFor(pathname) {
  if (pathname.includes("/step-up/")) return "/api/operations/orchestrations/step-up/status";
  if (pathname.includes("/escalation/")) return "/api/operations/orchestrations/escalation";
  if (pathname.includes("/break-glass/")) return "/api/operations/orchestrations/break-glass";
  if (pathname.includes("/audit-chain")) return "/api/observability/orchestrations/audit-chain";
  if (pathname.includes("/retention")) return "/api/observability/orchestrations/retention";
  if (pathname.includes("/alert-webhooks")) return "/api/observability/orchestrations/alert-webhooks";
  if (pathname.includes("/compliance")) return "/api/observability/orchestrations/summary";
  return "/api/operations/orchestrations/escalation";
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

server.app.get("/api/openclaw/modifier/ops/*", gone);
server.app.post("/api/openclaw/modifier/ops/*", gone);
server.app.put("/api/openclaw/modifier/ops/*", gone);
server.app.patch("/api/openclaw/modifier/ops/*", gone);
server.app.delete("/api/openclaw/modifier/ops/*", gone);
server.app.get("/api/openclaw/modifier/ops", gone);
server.app.post("/api/openclaw/modifier/ops", gone);
server.app.put("/api/openclaw/modifier/ops", gone);
server.app.patch("/api/openclaw/modifier/ops", gone);
server.app.delete("/api/openclaw/modifier/ops", gone);
