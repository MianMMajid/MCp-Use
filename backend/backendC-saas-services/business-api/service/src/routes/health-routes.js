import { serviceName } from "../config.js";

export function registerHealthRoutes(app, options = {}) {
  const getDatabase = options.getDatabase ?? (() => null);

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
    })
  );

  app.get("/ready", async (c) => {
    const db = typeof getDatabase === "function" ? getDatabase() : null;
    let dbReady = false;
    if (db?.pool) {
      try {
        await Promise.race([
          db.pool.query("SELECT 1"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
        dbReady = true;
      } catch {
        dbReady = false;
      }
    }
    const ready = dbReady;
    return c.json(
      {
        ready,
        service: serviceName,
        timestamp: new Date().toISOString(),
        db: dbReady ? { ok: true } : { ok: false, reason: db?.pool ? "query failed" : "pool not initialized" },
      },
      ready ? 200 : 503,
    );
  });
}
