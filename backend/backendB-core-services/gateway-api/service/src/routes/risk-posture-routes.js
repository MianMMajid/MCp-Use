/**
 * risk-posture-routes.js
 *
 * Phase 6A: Aggregate risk posture score (0–100) computed from multiple
 * signal sources — firewall coverage, denial rate, MFA adoption, SSO
 * adoption, and open approvals. Returns a weighted score, 30-day trend
 * data, and actionable recommendation cards.
 *
 * GET /api/risk/posture
 */
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { database } from "../state.js";
import { mapleLog } from "../logging.js";

// ── Signal weights (must sum to 1.0) ────────────────────────────────────────
const WEIGHTS = {
  firewallRulesCoverage: 0.25,
  denialRate:            0.20,
  mfaAdoption:          0.20,
  ssoAdoption:          0.15,
  openApprovals:        0.20,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

async function safeQuery(pool, sql, params = []) {
  try {
    return (await pool.query(sql, params)).rows;
  } catch {
    return [];
  }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute individual signal scores (each 0–100, where 100 = best posture).
 */
async function computeSignals(pool) {
  // 1. Firewall rules coverage — ratio of enabled rules to total rules
  const fwRows = await safeQuery(pool,
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE enabled = TRUE)::int AS enabled
     FROM firewall_rules`
  );
  const fwTotal   = fwRows[0]?.total ?? 0;
  const fwEnabled = fwRows[0]?.enabled ?? 0;
  const firewallRulesCoverage = fwTotal > 0
    ? clamp(Math.round((fwEnabled / fwTotal) * 100))
    : 0; // no rules ⇒ no coverage

  // 2. Denial rate — low denial rate is good, high means lots of blocked
  //    attacks (positive signal) but could also mean misconfiguration.
  //    We treat a moderate denial rate (5-20%) as optimal.
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const auditRows = await safeQuery(pool,
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE event_type ILIKE '%DENIED%' OR event_type ILIKE '%BLOCKED%' OR event_type ILIKE '%BLOCK%')::int AS denied
     FROM audit_events
     WHERE timestamp >= $1`,
    [thirtyDaysAgo]
  );
  const auditTotal  = auditRows[0]?.total ?? 0;
  const auditDenied = auditRows[0]?.denied ?? 0;
  let denialRate;
  if (auditTotal === 0) {
    denialRate = 50; // no data — neutral
  } else {
    const ratio = auditDenied / auditTotal;
    // Sweet spot: 5–20% denial rate is best (security is working)
    if (ratio >= 0.05 && ratio <= 0.20) {
      denialRate = 100;
    } else if (ratio < 0.05) {
      // Very low denial — either no threats or policies too permissive
      denialRate = clamp(Math.round(ratio / 0.05 * 80));
    } else {
      // >20% — too many blocks, possible misconfiguration
      denialRate = clamp(Math.round(100 - ((ratio - 0.20) / 0.80) * 60));
    }
  }

  // 3. MFA adoption — verified MFA methods vs total users
  const mfaRows = await safeQuery(pool,
    `SELECT
       (SELECT COUNT(DISTINCT user_id)::int FROM user_mfa_methods WHERE verified = TRUE) AS mfa_users,
       (SELECT COUNT(*)::int FROM business_users) AS total_users`
  );
  const mfaUsers   = mfaRows[0]?.mfa_users ?? 0;
  const totalUsers = mfaRows[0]?.total_users ?? 0;
  const mfaAdoption = totalUsers > 0
    ? clamp(Math.round((mfaUsers / totalUsers) * 100))
    : 50; // no users — neutral

  // 4. SSO adoption — at least one enabled SSO configuration is good
  const ssoRows = await safeQuery(pool,
    `SELECT COUNT(*)::int AS enabled_count FROM sso_configurations WHERE enabled = TRUE`
  );
  const ssoEnabled = ssoRows[0]?.enabled_count ?? 0;
  const ssoAdoption = ssoEnabled > 0 ? 100 : 0;

  // 5. Open approvals — pending approvals waiting > 0 is a risk
  const approvalRows = await safeQuery(pool,
    `SELECT COUNT(*)::int AS pending
     FROM hitl_approval_queue
     WHERE status = 'pending'`
  );
  const pendingApprovals = approvalRows[0]?.pending ?? 0;
  // 0 pending = 100, each pending item reduces score (cap at 20 items → 0)
  const openApprovals = clamp(Math.round(100 - (pendingApprovals / 20) * 100));

  return {
    firewallRulesCoverage: { score: firewallRulesCoverage, enabledRules: fwEnabled, totalRules: fwTotal },
    denialRate:            { score: denialRate, deniedEvents: auditDenied, totalEvents: auditTotal },
    mfaAdoption:          { score: mfaAdoption, mfaUsers, totalUsers },
    ssoAdoption:          { score: ssoAdoption, enabledProviders: ssoEnabled },
    openApprovals:        { score: openApprovals, pendingCount: pendingApprovals },
  };
}

/**
 * Compute 30-day trend data — one data point per day (score snapshots).
 * We approximate by re-computing denial-rate history from audit events.
 */
async function computeTrend(pool) {
  const rows = await safeQuery(pool,
    `SELECT
       DATE(timestamp) AS day,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE event_type ILIKE '%DENIED%' OR event_type ILIKE '%BLOCKED%' OR event_type ILIKE '%BLOCK%')::int AS denied
     FROM audit_events
     WHERE timestamp >= NOW() - INTERVAL '30 days'
     GROUP BY DATE(timestamp)
     ORDER BY day`
  );

  return rows.map((r) => ({
    date: r.day,
    totalEvents: r.total,
    deniedEvents: r.denied,
    denialPct: r.total > 0 ? Math.round((r.denied / r.total) * 100) : 0,
  }));
}

/**
 * Generate recommendation cards based on signal scores.
 */
function generateRecommendations(signals) {
  const cards = [];

  if (signals.firewallRulesCoverage.score < 50) {
    cards.push({
      id: "rec_firewall_coverage",
      severity: "high",
      title: "Low firewall rule coverage",
      description: `Only ${signals.firewallRulesCoverage.enabledRules} of ${signals.firewallRulesCoverage.totalRules} rules are enabled. Review and enable applicable rules.`,
      action: "/settings/firewall",
    });
  }

  if (signals.mfaAdoption.score < 80) {
    cards.push({
      id: "rec_mfa_adoption",
      severity: signals.mfaAdoption.score < 30 ? "high" : "medium",
      title: "Increase MFA adoption",
      description: `${signals.mfaAdoption.mfaUsers} of ${signals.mfaAdoption.totalUsers} users have MFA enabled. Consider enforcing MFA for all accounts.`,
      action: "/settings/security",
    });
  }

  if (signals.ssoAdoption.score === 0) {
    cards.push({
      id: "rec_sso_setup",
      severity: "medium",
      title: "Configure SSO provider",
      description: "No SSO provider is configured. Enable SAML or OIDC SSO for centralized identity management.",
      action: "/settings/sso",
    });
  }

  if (signals.openApprovals.pendingCount > 5) {
    cards.push({
      id: "rec_pending_approvals",
      severity: signals.openApprovals.pendingCount > 15 ? "high" : "medium",
      title: "Review pending approvals",
      description: `${signals.openApprovals.pendingCount} approvals are waiting for review. Stale approvals may block agent operations.`,
      action: "/approvals",
    });
  }

  if (signals.denialRate.score < 40 && signals.denialRate.totalEvents > 0) {
    cards.push({
      id: "rec_denial_rate",
      severity: "medium",
      title: "Unusual denial rate detected",
      description: "The denial rate is outside the optimal range. Review recent firewall decisions for misconfiguration.",
      action: "/audit",
    });
  }

  return cards;
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerRiskPostureRoutes(app) {
  app.get("/api/risk/posture", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) {
      return c.json({ error: "Database unavailable." }, 503);
    }

    try {
      const signals = await computeSignals(pool);

      // Weighted aggregate score
      const overallScore = clamp(Math.round(
        signals.firewallRulesCoverage.score * WEIGHTS.firewallRulesCoverage +
        signals.denialRate.score            * WEIGHTS.denialRate +
        signals.mfaAdoption.score           * WEIGHTS.mfaAdoption +
        signals.ssoAdoption.score           * WEIGHTS.ssoAdoption +
        signals.openApprovals.score         * WEIGHTS.openApprovals
      ));

      // Posture grade
      let grade;
      if (overallScore >= 90) grade = "A";
      else if (overallScore >= 75) grade = "B";
      else if (overallScore >= 60) grade = "C";
      else if (overallScore >= 40) grade = "D";
      else grade = "F";

      const trend = await computeTrend(pool);
      const recommendations = generateRecommendations(signals);

      mapleLog("info", "risk_posture.computed", { overallScore, grade });

      return c.json({
        ok: true,
        score: overallScore,
        grade,
        signals,
        weights: WEIGHTS,
        trend,
        recommendations,
        computedAt: new Date().toISOString(),
      });
    } catch (err) {
      mapleLog("error", "risk_posture.compute_failed", { error: err instanceof Error ? err.message : String(err) });
      return c.json({ error: "Failed to compute risk posture", details: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
