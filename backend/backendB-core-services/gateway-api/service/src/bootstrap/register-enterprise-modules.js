import { configureOpenClawModifierRuntime } from "../core/openclaw-modifier-runtime.js";
import { configureTenantClaimResolver, ensureTenantBindingsTable } from "../core/tenant-claim-resolver.js";
import { configureStepUpAuth, ensureStepUpTable } from "../core/step-up-auth.js";
import { configureOrgHierarchy, ensureOrgHierarchyTables } from "../core/org-hierarchy.js";
import { configureRateLimiter, ensureRateLimiterTables } from "../core/rate-limiter.js";
import { configureEscalationChain, ensureEscalationTables } from "../core/escalation-chain.js";
import { configureAuditIntegrity, ensureAuditChainTable } from "../core/audit-integrity.js";
import { configureAlertWebhook, ensureAlertWebhookTables } from "../core/alert-webhook.js";
import { configureComplianceReporter } from "../core/compliance-reporter.js";

export async function registerEnterpriseModules({ database }) {
  configureOpenClawModifierRuntime({ database });
  configureTenantClaimResolver({ database });
  configureStepUpAuth({ database });
  configureOrgHierarchy({ database });
  configureRateLimiter({ database });
  configureEscalationChain({ database });
  configureAuditIntegrity({ database });
  configureAlertWebhook({ database });
  configureComplianceReporter({ database });

  await Promise.all([
    ensureTenantBindingsTable(database),
    ensureStepUpTable(database),
    ensureOrgHierarchyTables(database),
    ensureRateLimiterTables(database),
    ensureEscalationTables(database),
    ensureAuditChainTable(database),
    ensureAlertWebhookTables(database),
  ]);
}
