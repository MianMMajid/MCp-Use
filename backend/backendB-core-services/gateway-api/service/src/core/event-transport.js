/**
 * event-transport.js
 *
 * Abstraction over pub/sub transports for cross-instance event propagation.
 * Supports Postgres LISTEN/NOTIFY (default) and optional Redis pub/sub.
 *
 * Usage:
 *   const transport = createEventTransport({ backend: "pg", database });
 *   transport.subscribe("channel", (data) => { ... });
 *   transport.publish("channel", { event: "foo" });
 *   await transport.close();
 */
import { mapleLog } from "../logging.js";

/**
 * Create an event transport instance.
 * @param {object} config
 * @param {"pg"|"redis"} config.backend - Transport backend (default: "pg")
 * @param {object} [config.database] - Postgres database instance (for pg backend)
 * @param {string} [config.redisUrl] - Redis connection URL (for redis backend)
 * @returns {{ publish, subscribe, close }}
 */
// PostgreSQL channel names must be valid identifiers to prevent SQL injection.
// Strip everything except alphanumerics, underscores, and hyphens, then quote.
const CHANNEL_NAME_RE = /^[a-zA-Z0-9_-]{1,63}$/;
function sanitizeChannelName(name) {
  if (!CHANNEL_NAME_RE.test(name)) {
    // Replace unsafe chars, truncate, and wrap in double-quotes for safety.
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 63);
    return `"${safe}"`;
  }
  return `"${name}"`;
}

export function createEventTransport(config = {}) {
  const backend = config.backend ?? "pg";

  if (backend === "redis") {
    return createRedisTransport(config);
  }
  return createPgTransport(config);
}

// ── Postgres LISTEN/NOTIFY Transport ─────────────────────────────────────

function createPgTransport(config) {
  const database = config.database;
  const subscriptions = new Map(); // channel → Set<listener>
  let pgClient = null;
  let closed = false;
  let connecting = null; // serializes concurrent ensurePgClient() calls

  async function ensurePgClient() {
    if (closed) return null;
    if (pgClient) return pgClient;
    if (!database?.pool) return null;
    // Serialize: if another call is already connecting, wait for it
    if (connecting) return connecting;

    connecting = _doConnect();
    try {
      return await connecting;
    } finally {
      connecting = null;
    }
  }

  async function _doConnect() {
    try {
      const client = await database.pool.connect();

      // Re-check after async gap: if close() ran while we were awaiting
      // pool.connect(), release the late client immediately to avoid
      // orphaning it and blocking pool.end().
      if (closed) {
        try { client.release(); } catch { /* ignore */ }
        return null;
      }

      // Guard against a concurrent call that resolved first (shouldn't
      // happen with the serialization above, but defensive).
      if (pgClient) {
        try { client.release(); } catch { /* ignore */ }
        return pgClient;
      }

      pgClient = client;

      client.on("notification", (msg) => {
        const listeners = subscriptions.get(msg.channel);
        if (!listeners) return;
        try {
          const data = JSON.parse(msg.payload);
          for (const listener of listeners) {
            try {
              listener(data);
            } catch (err) {
              mapleLog("warn", "event_transport.pg.listener_error", {
                channel: msg.channel,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } catch (err) {
          mapleLog("warn", "event_transport.pg.parse_error", {
            channel: msg.channel,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      client.on("error", (err) => {
        mapleLog("warn", "event_transport.pg.client_error", {
          error: err instanceof Error ? err.message : String(err),
        });
        pgClient = null;
        // Attempt reconnect after delay
        if (!closed) {
          setTimeout(() => ensurePgClient().catch(() => {}), 5000);
        }
      });

      // Re-subscribe any existing channels (sanitize names to prevent SQL injection)
      for (const channel of subscriptions.keys()) {
        await client.query(`LISTEN ${sanitizeChannelName(channel)}`);
      }

      return client;
    } catch (err) {
      pgClient = null;
      mapleLog("warn", "event_transport.pg.connect_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  return {
    backend: "pg",

    async publish(channel, data) {
      if (!database?.pool) return;
      const payload = JSON.stringify(data);
      await database.pool
        .query(`SELECT pg_notify($1, $2)`, [channel, payload])
        .catch((err) => {
          mapleLog("warn", "event_transport.pg.publish_failed", {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },

    async subscribe(channel, listener) {
      if (!subscriptions.has(channel)) {
        subscriptions.set(channel, new Set());
      }
      subscriptions.get(channel).add(listener);

      const client = await ensurePgClient();
      if (client) {
        await client.query(`LISTEN ${sanitizeChannelName(channel)}`).catch((err) => {
          mapleLog("warn", "event_transport.pg.listen_failed", {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      return () => {
        const listeners = subscriptions.get(channel);
        if (listeners) {
          listeners.delete(listener);
        }
      };
    },

    async close() {
      closed = true;
      if (pgClient) {
        try {
          pgClient.release();
        } catch {
          // ignore release errors
        }
        pgClient = null;
      }
      subscriptions.clear();
    },
  };
}

// ── Redis Pub/Sub Transport ──────────────────────────────────────────────

function createRedisTransport(config) {
  const redisUrl = config.redisUrl;
  let pubClient = null;
  let subClient = null;
  let closed = false;
  const subscriptions = new Map(); // channel → Set<listener>

  async function ensureClients() {
    if (closed) return false;
    if (pubClient && subClient) return true;
    if (!redisUrl) return false;

    try {
      // Lazy-load ioredis to avoid hard dependency
      const { default: Redis } = await import("ioredis");
      pubClient = new Redis(redisUrl);
      subClient = new Redis(redisUrl);

      subClient.on("message", (channel, message) => {
        const listeners = subscriptions.get(channel);
        if (!listeners) return;
        try {
          const data = JSON.parse(message);
          for (const listener of listeners) {
            try {
              listener(data);
            } catch (err) {
              mapleLog("warn", "event_transport.redis.listener_error", {
                channel,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        } catch (err) {
          mapleLog("warn", "event_transport.redis.parse_error", {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      subClient.on("error", (err) => {
        mapleLog("warn", "event_transport.redis.sub_error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      pubClient.on("error", (err) => {
        mapleLog("warn", "event_transport.redis.pub_error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return true;
    } catch (err) {
      mapleLog("warn", "event_transport.redis.init_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  return {
    backend: "redis",

    async publish(channel, data) {
      const ready = await ensureClients();
      if (!ready || !pubClient) return;
      const payload = JSON.stringify(data);
      await pubClient.publish(channel, payload).catch((err) => {
        mapleLog("warn", "event_transport.redis.publish_failed", {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },

    async subscribe(channel, listener) {
      if (!subscriptions.has(channel)) {
        subscriptions.set(channel, new Set());
      }
      subscriptions.get(channel).add(listener);

      const ready = await ensureClients();
      if (ready && subClient) {
        await subClient.subscribe(channel).catch((err) => {
          mapleLog("warn", "event_transport.redis.subscribe_failed", {
            channel,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      return () => {
        const listeners = subscriptions.get(channel);
        if (listeners) {
          listeners.delete(listener);
        }
      };
    },

    async close() {
      closed = true;
      if (subClient) {
        try { await subClient.quit(); } catch { /* ignore */ }
        subClient = null;
      }
      if (pubClient) {
        try { await pubClient.quit(); } catch { /* ignore */ }
        pubClient = null;
      }
      subscriptions.clear();
    },
  };
}
