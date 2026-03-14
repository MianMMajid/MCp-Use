import { runDueTasksOnce } from "../routes/frontend-b-routes.js";
import { mapleLog } from "../logging.js";

let timer = null;

export function startFrontendBTaskWorker() {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    runDueTasksOnce().catch((error) => {
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
}
