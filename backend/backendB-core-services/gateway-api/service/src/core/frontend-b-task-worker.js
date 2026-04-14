import { runDueTasksOnce } from "../routes/frontend-b-routes.js";
import { mapleLog } from "../logging.js";
import { withLeaderLock, LOCK_IDS } from "./leader-election.js";

let timer = null;
let workerDatabase = null;
let useLeaderElection = true;

export function startFrontendBTaskWorker(options = {}) {
  if (timer) {
    return;
  }
  workerDatabase = options.database ?? null;
  useLeaderElection = options.leaderElectionEnabled !== false;
  timer = setInterval(() => {
    const run = () => runDueTasksOnce();
    const work = useLeaderElection
      ? withLeaderLock(LOCK_IDS.FRONTEND_B_TASK_WORKER, workerDatabase, run)
      : run();
    Promise.resolve(work).catch((error) => {
      if (error && typeof error === "object" && error.skipped) {
        return;
      }
      mapleLog("warn", "frontend_b.task_worker_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 30_000);
  timer.unref?.();
}

export function stopFrontendBTaskWorker() {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = null;
  workerDatabase = null;
  useLeaderElection = true;
}
