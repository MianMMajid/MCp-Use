import { serviceName } from "../config.js";

export function registerHealthRoutes(app) {
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
    })
  );

  app.get("/ready", (c) =>
    c.json({
      ready: true,
      service: serviceName,
      timestamp: new Date().toISOString(),
    })
  );
}
