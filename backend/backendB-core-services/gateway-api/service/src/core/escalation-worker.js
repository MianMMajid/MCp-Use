/**
 * escalation-worker.js
 *
 * Periodic worker that checks for pending modifier approvals past their
 * escalation timeout and triggers automatic escalation via escalation-chain.
 */
import { mapleLog } from "../logging.js";
import { escalateApproval } from "./escalation-chain.js";
import { withLeaderLock, LOCK_IDS } from "./leader-election.js";

let _database = null;
let _timer = null;

const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

/**
 * Find pending approvals that have exceeded the escalation timeout
 * and escalate them to the next level.
 */
async function checkAndEscalateStalled(database) {
  if (!hasPool(database)) return { checked: 0, escalated: 0 };

  const result = await withLeaderLock(LOCK_IDS.ESCALATION_WORKER, database, async () => {
    // Find pending modifier approvals that have been waiting longer than
    // the escalation chain's timeout (default 300s) without being escalated recently
    // Query the correct table: gateway_modifier_approvals (from OpenClawModifierStore)
    // Also join with escalation chains to use the configured timeout per tenant/org
    const stalledResult = await database.pool.query(
      `SELECT a.approval_id, a.tenant_id, a.org_id, a.created_at,
              COALESCE(e.escalation_timeout_seconds, 300) AS timeout_seconds
       FROM gateway_modifier_approvals a
       LEFT JOIN modifier_escalation_chains e
         ON e.tenant_id = a.tenant_id AND e.org_id = a.org_id AND e.chain_name = 'default'
       WHERE a.status = 'pending'
         AND a.created_at < $1
       ORDER BY a.created_at ASC
       LIMIT 50`,
      [new Date(Date.now() - 300_000).toISOString()] // default 5 min fallback
    );

    // Filter out approvals that haven't actually exceeded their specific timeout
    const nowMs = Date.now();
    const actuallyStalled = stalledResult.rows.filter((row) => {
      const createdMs = new Date(row.created_at).getTime();
      const timeoutMs = Number(row.timeout_seconds) * 1000;
      return (nowMs - createdMs) > timeoutMs;
    });

    let escalated = 0;
    for (const row of actuallyStalled) {
      try {
        const result = await escalateApproval(
          row.approval_id,
          row.tenant_id,
          row.org_id
        );
        if (result.escalated) {
          escalated++;
          mapleLog("info", "escalation_worker.escalated", {
            approvalId: row.approval_id,
            level: result.currentLevel,
          });
        }
      } catch (err) {
        mapleLog("warn", "escalation_worker.escalate_failed", {
          approvalId: row.approval_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { checked: actuallyStalled.length, escalated };
  });

  return result ?? { checked: 0, escalated: 0 };
}

/**
 * Start the escalation worker.
 */
export function startEscalationWorker(options = {}) {
  if (options.database) {
    _database = options.database;
  }
  if (_timer) return;

  const intervalMs = Number(process.env.MAPLE_ESCALATION_CHECK_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  _timer = setInterval(() => {
    checkAndEscalateStalled(_database).catch((err) => {
      mapleLog("warn", "escalation_worker.tick_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);

  if (_timer.unref) {
    _timer.unref();
  }

  mapleLog("info", "escalation_worker.started", { intervalMs });
}

/**
 * Stop the escalation worker.
 */
export function stopEscalationWorker() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
