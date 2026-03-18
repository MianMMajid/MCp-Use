/**
 * modifier-approval-broker.js
 *
 * Event bus for modifier approval lifecycle events.
 * Supports both in-process listeners and cross-instance propagation
 * via a pluggable event transport (Postgres LISTEN/NOTIFY or Redis pub/sub).
 */
import { mapleLog } from "./logging.js";
import { createEventTransport } from "./core/event-transport.js";

const listeners = new Set();
const recentEvents = [];
const MAX_RECENT = 200;
const PG_CHANNEL = "modifier_approval_events";

let _transport = null;

/**
 * Configure the broker with a database for cross-instance pub/sub.
 * @param {object} options
 * @param {object} [options.database] - Postgres database instance
 * @param {string} [options.transportBackend] - "pg" | "redis" (default: "pg")
 * @param {string} [options.redisUrl] - Redis connection URL (for redis backend)
 */
export function configureModifierApprovalBroker(options = {}) {
  const backend = options.transportBackend ?? "pg";

  if (options.database || options.redisUrl) {
    _transport = createEventTransport({
      backend,
      database: options.database,
      redisUrl: options.redisUrl,
    });

    _transport.subscribe(PG_CHANNEL, (event) => {
      // Only dispatch to local listeners (avoid re-publishing)
      dispatchToLocalListeners(event);
    }).catch((err) => {
      mapleLog("warn", "modifier_approval_broker.transport_subscribe_failed", {
        backend,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Dispatch an event to local in-process listeners only (no cross-instance publish).
 */
function dispatchToLocalListeners(event) {
  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT) {
    recentEvents.shift();
  }

  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      mapleLog("warn", "modifier_approval_broker.listener_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Emit a modifier approval event to all subscribers (local + cross-instance).
 * @param {"approval_created"|"approval_decided"|"approval_escalated"|"approval_expired"} eventType
 * @param {object} data - event payload
 */
export function emitModifierApprovalEvent(eventType, data) {
  const event = {
    eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Dispatch locally
  dispatchToLocalListeners(event);

  // Publish via transport for cross-instance propagation
  if (_transport) {
    _transport.publish(PG_CHANNEL, event).catch((err) => {
      mapleLog("warn", "modifier_approval_broker.transport_publish_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Subscribe to modifier approval events.
 * Returns an unsubscribe function.
 */
export function subscribeModifierApprovals(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * List recent buffered modifier approval events.
 */
export function listRecentModifierApprovalEvents() {
  return [...recentEvents];
}

/**
 * Stop the transport and clean up.
 * @returns {Promise<void>}
 */
export async function stopModifierApprovalBroker() {
  if (_transport) {
    const transport = _transport;
    _transport = null;
    await transport.close().catch(() => {});
  }
}
