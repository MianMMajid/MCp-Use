import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => c.json({ status: "ok", service: "gateway-api", timestamp: new Date().toISOString() }));
healthRoutes.get("/ready", (c) => c.json({ ready: true }));
