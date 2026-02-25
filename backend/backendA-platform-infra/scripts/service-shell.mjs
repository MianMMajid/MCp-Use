#!/usr/bin/env node

import { createServer } from "node:http";

const serviceName = process.env.SERVICE_NAME ?? "service-shell";
const serviceDescription =
  process.env.SERVICE_DESCRIPTION ?? "Placeholder service shell for local Kubernetes topology.";
const serviceVersion = process.env.SERVICE_VERSION ?? "local-dev";
const portRaw = Number.parseInt(process.env.PORT ?? "8080", 10);
const port = Number.isFinite(portRaw) ? portRaw : 8080;

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: serviceName,
      version: serviceVersion,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/" || url.pathname === "/info") {
    json(res, 200, {
      service: serviceName,
      description: serviceDescription,
      version: serviceVersion,
      status: "running",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  json(res, 404, {
    ok: false,
    service: serviceName,
    error: "Not found",
    path: url.pathname,
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[${serviceName}] listening on 0.0.0.0:${port}`);
});
