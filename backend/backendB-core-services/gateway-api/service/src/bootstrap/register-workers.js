import { startHitlBroker, stopHitlBroker } from "../hitl-broker.js";
import { configureModifierApprovalBroker, stopModifierApprovalBroker } from "../modifier-approval-broker.js";
import { startAuditOutboxWorker, stopAuditOutboxWorker } from "../core/audit-outbox.js";
import { startEscalationWorker, stopEscalationWorker } from "../core/escalation-worker.js";
import { startRetentionWorker, stopRetentionWorker } from "../core/retention-worker.js";
import { startBillingQueueWorker, stopBillingQueueWorker } from "../core/billing-cache.js";
import { startTraceExporter, stopTraceExporter } from "../core/trace-exporter.js";
import { startFrontendBTaskWorker, stopFrontendBTaskWorker } from "../core/frontend-b-task-worker.js";

function isTruthyEnv(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function startGatewayWorkers({ database, transportBackend, redisUrl }) {
  const isProduction = process.env.NODE_ENV === "production";
  const hitlDisabled = isTruthyEnv(process.env.MAPLE_DISABLE_HITL_BROKER ?? "0");

  if (hitlDisabled && isProduction) {
    console.warn("[register-workers] MAPLE_DISABLE_HITL_BROKER is ignored in production. HITL broker will start.");
  }

  if (!hitlDisabled || isProduction) {
    startHitlBroker();
  }

  configureModifierApprovalBroker({ database, transportBackend, redisUrl });
  startAuditOutboxWorker({ database });
  startEscalationWorker({ database });
  startRetentionWorker({ database });
  startBillingQueueWorker({ database });
  startTraceExporter();
  startFrontendBTaskWorker();

  return async function stopGatewayWorkers() {
    stopHitlBroker();
    stopModifierApprovalBroker();
    await stopAuditOutboxWorker();
    stopEscalationWorker();
    stopRetentionWorker();
    stopBillingQueueWorker();
    stopFrontendBTaskWorker();
    await stopTraceExporter();
  };
}
