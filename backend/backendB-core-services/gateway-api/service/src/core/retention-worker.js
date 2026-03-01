/**
 * retention-worker.js
 *
 * Periodic worker (daily cadence) that enforces audit retention policy
 * by calling enforceRetention() from audit-integrity.js.
 */
import { mapleLog } from "../logging.js";
import { enforceRetention } from "./audit-integrity.js";
import { withLeaderLock, LOCK_IDS } from "./leader-election.js";

let _database = null;
let _timer = null;

const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

/**
 * Start the retention enforcement worker.
 */
export function startRetentionWorker(options = {}) {
  if (options.database) {
    _database = options.database;
  }
  if (_timer) return;

  const intervalMs = Number(process.env.MAPLE_RETENTION_CHECK_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

  _timer = setInterval(() => {
    withLeaderLock(LOCK_IDS.RETENTION_WORKER, _database, async () => {
      const result = await enforceRetention({ database: _database });
      if (result.deleted > 0) {
        mapleLog("info", "retention_worker.enforced", { deleted: result.deleted });
      }
      return result;
    }).catch((err) => {
      mapleLog("warn", "retention_worker.tick_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);

  if (_timer.unref) {
    _timer.unref();
  }

  mapleLog("info", "retention_worker.started", { intervalMs });
}

/**
 * Stop the retention worker.
 */
export function stopRetentionWorker() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
