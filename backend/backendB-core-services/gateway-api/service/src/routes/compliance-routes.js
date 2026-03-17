/**
 * compliance-routes.js
 *
 * Phase 6B: Compliance framework mapping endpoints. Tracks control
 * status across OWASP LLM Top 10 and NIST AI RMF frameworks with
 * evidence collection.
 *
 * GET  /api/compliance/frameworks      — list available frameworks
 * GET  /api/compliance/mappings        — list control mappings for a framework
 * PATCH /api/compliance/mappings/:id   — update control status + evidence
 * POST /api/compliance/seed            — seed OWASP LLM Top 10 controls
 */
import { requireApiKeyResponse, getAuthContext } from "../auth-api-key.js";
import { database } from "../state.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

// ── Table bootstrap ─────────────────────────────────────────────────────────

async function ensureComplianceMappingsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_mappings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      framework TEXT NOT NULL,
      control_id TEXT NOT NULL,
      control_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_assessed'
        CHECK (status IN ('compliant', 'partial', 'non_compliant', 'not_assessed')),
      evidence_json TEXT DEFAULT '[]',
      updated_by TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (framework, control_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_compliance_mappings_framework
      ON compliance_mappings(framework)
  `);
}

let _tableEnsured = false;

// ── Seed data ───────────────────────────────────────────────────────────────

const OWASP_LLM_TOP_10 = [
  { control_id: "LLM01", control_name: "Prompt Injection", description: "Prevent manipulation of LLM behavior through crafted inputs that override system instructions or extract sensitive information." },
  { control_id: "LLM02", control_name: "Insecure Output Handling", description: "Ensure LLM outputs are validated and sanitized before passing to downstream systems, preventing XSS, SSRF, or code injection." },
  { control_id: "LLM03", control_name: "Training Data Poisoning", description: "Protect training data integrity through validation, provenance tracking, and anomaly detection in fine-tuning pipelines." },
  { control_id: "LLM04", control_name: "Model Denial of Service", description: "Implement rate limiting, input size constraints, and resource quotas to prevent resource exhaustion attacks against LLM endpoints." },
  { control_id: "LLM05", control_name: "Supply Chain Vulnerabilities", description: "Vet third-party models, plugins, and training data sources. Maintain SBOM for AI components and monitor for known vulnerabilities." },
  { control_id: "LLM06", control_name: "Sensitive Information Disclosure", description: "Prevent leakage of PII, credentials, or proprietary data in LLM responses through output filtering and data classification." },
  { control_id: "LLM07", control_name: "Insecure Plugin Design", description: "Apply least-privilege access controls to LLM plugins/tools. Validate all plugin inputs and enforce authorization boundaries." },
  { control_id: "LLM08", control_name: "Excessive Agency", description: "Constrain LLM autonomous actions through human-in-the-loop approvals, action allowlists, and scope limitations." },
  { control_id: "LLM09", control_name: "Overreliance", description: "Implement confidence scoring, fact-checking mechanisms, and human oversight to mitigate blind trust in LLM outputs." },
  { control_id: "LLM10", control_name: "Model Theft", description: "Protect model weights and fine-tuning data through access controls, watermarking, and monitoring for extraction attacks." },
];

const NIST_AI_RMF_CONTROLS = [
  { control_id: "GOVERN-1", control_name: "AI Risk Management Governance", description: "Establish policies, procedures, and accountability structures for AI risk management across the organization." },
  { control_id: "GOVERN-2", control_name: "AI Impact Assessment", description: "Conduct and maintain impact assessments for AI systems covering fairness, privacy, safety, and security dimensions." },
  { control_id: "MAP-1", control_name: "AI System Contextualization", description: "Identify and document the context of use, intended purpose, and stakeholders for each AI system." },
  { control_id: "MAP-2", control_name: "AI Risk Identification", description: "Systematically identify risks associated with AI system design, development, deployment, and operation." },
  { control_id: "MEASURE-1", control_name: "AI Performance Measurement", description: "Define and track quantitative metrics for AI system accuracy, fairness, robustness, and reliability." },
  { control_id: "MEASURE-2", control_name: "AI Bias and Fairness Testing", description: "Implement testing protocols to detect and measure bias across protected attributes in AI system outputs." },
  { control_id: "MANAGE-1", control_name: "AI Risk Response", description: "Define and implement risk response strategies including mitigation, transfer, acceptance, and avoidance for identified AI risks." },
  { control_id: "MANAGE-2", control_name: "AI Incident Response", description: "Establish incident response procedures specific to AI system failures, adversarial attacks, and unexpected behaviors." },
  { control_id: "MANAGE-3", control_name: "AI Continuous Monitoring", description: "Implement ongoing monitoring of AI system performance, data drift, and operational anomalies in production." },
  { control_id: "MANAGE-4", control_name: "AI Transparency and Documentation", description: "Maintain comprehensive documentation of AI system design decisions, training data, and operational parameters." },
];

const FRAMEWORKS = [
  {
    id: "owasp-llm-top-10",
    name: "OWASP LLM Top 10",
    version: "1.1",
    description: "Top 10 security risks for Large Language Model applications, published by OWASP.",
    controlCount: OWASP_LLM_TOP_10.length,
  },
  {
    id: "nist-ai-rmf",
    name: "NIST AI Risk Management Framework",
    version: "1.0",
    description: "NIST framework for managing risks in AI systems across Govern, Map, Measure, and Manage functions.",
    controlCount: NIST_AI_RMF_CONTROLS.length,
  },
];

// ── Route registration ──────────────────────────────────────────────────────

export function registerComplianceRoutes(app) {
  // ── List available frameworks ─────────────────────────────────────────
  app.get("/api/compliance/frameworks", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    return c.json({ ok: true, items: FRAMEWORKS });
  });

  // ── List control mappings for a framework ─────────────────────────────
  app.get("/api/compliance/mappings", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureComplianceMappingsTable(pool); _tableEnsured = true; }

    const framework = c.req.query("framework") || "";
    if (!framework) {
      return c.json({ error: "framework query parameter is required." }, 400);
    }

    try {
      const result = await pool.query(
        `SELECT id, framework, control_id, control_name, description, status, evidence_json, updated_by, updated_at, created_at
         FROM compliance_mappings
         WHERE framework = $1
         ORDER BY control_id`,
        [framework]
      );

      const items = result.rows.map((row) => {
        let evidence = [];
        try {
          evidence = typeof row.evidence_json === "string"
            ? JSON.parse(row.evidence_json || "[]")
            : Array.isArray(row.evidence_json) ? row.evidence_json : [];
        } catch { evidence = []; }
        return { ...row, evidence };
      });

      // Compute summary stats
      const summary = {
        total: items.length,
        compliant: items.filter((i) => i.status === "compliant").length,
        partial: items.filter((i) => i.status === "partial").length,
        non_compliant: items.filter((i) => i.status === "non_compliant").length,
        not_assessed: items.filter((i) => i.status === "not_assessed").length,
      };
      summary.compliancePct = summary.total > 0
        ? Math.round(((summary.compliant + summary.partial * 0.5) / summary.total) * 100)
        : 0;

      return c.json({ ok: true, framework, items, summary });
    } catch (err) {
      mapleLog("error", "compliance.list_failed", { framework, error: err.message });
      return c.json({ error: "Failed to list compliance mappings", details: err.message }, 500);
    }
  });

  // ── Update control status + evidence ──────────────────────────────────
  app.patch("/api/compliance/mappings/:id", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureComplianceMappingsTable(pool); _tableEnsured = true; }

    const mappingId = asString(c.req.param("id"));
    const body = await readJsonBody(c);
    const authCtx = getAuthContext(c);

    const validStatuses = ["compliant", "partial", "non_compliant", "not_assessed"];
    if (body.status && !validStatuses.includes(body.status)) {
      return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
    }

    try {
      // Build dynamic update
      const updates = [];
      const values = [];
      let idx = 1;

      if (body.status !== undefined) {
        updates.push(`status = $${idx++}`);
        values.push(asString(body.status));
      }
      if (body.evidence !== undefined) {
        updates.push(`evidence_json = $${idx++}`);
        values.push(JSON.stringify(Array.isArray(body.evidence) ? body.evidence : []));
      }

      if (updates.length === 0) {
        return c.json({ error: "No fields to update. Provide status and/or evidence." }, 400);
      }

      updates.push(`updated_by = $${idx++}`);
      values.push(authCtx?.userId || "system");
      updates.push(`updated_at = NOW()`);

      values.push(mappingId);

      const result = await pool.query(
        `UPDATE compliance_mappings SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return c.json({ error: "Compliance mapping not found." }, 404);
      }

      const updated = result.rows[0];

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_COMPLIANCE_MAPPING_UPDATED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `Compliance control ${updated.control_id} updated to '${updated.status}'`,
        payload: { mappingId, controlId: updated.control_id, framework: updated.framework, status: updated.status },
      });

      return c.json({
        ok: true,
        mapping: {
          ...updated,
          evidence: JSON.parse(updated.evidence_json || "[]"),
        },
      });
    } catch (err) {
      mapleLog("error", "compliance.update_failed", { mappingId, error: err.message });
      return c.json({ error: "Failed to update compliance mapping", details: err.message }, 500);
    }
  });

  // ── Seed OWASP LLM Top 10 controls ───────────────────────────────────
  app.post("/api/compliance/seed", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const pool = database?.pool;
    if (!pool) return c.json({ error: "Database unavailable." }, 503);

    if (!_tableEnsured) { await ensureComplianceMappingsTable(pool); _tableEnsured = true; }

    const body = await readJsonBody(c);
    const framework = asString(body.framework) || "owasp-llm-top-10";
    const authCtx = getAuthContext(c);

    const controlSets = {
      "owasp-llm-top-10": OWASP_LLM_TOP_10,
      "nist-ai-rmf": NIST_AI_RMF_CONTROLS,
    };

    const controls = controlSets[framework];
    if (!controls) {
      return c.json({ error: `Unknown framework: ${framework}. Available: ${Object.keys(controlSets).join(", ")}` }, 400);
    }

    try {
      let seeded = 0;
      for (const ctrl of controls) {
        const result = await pool.query(
          `INSERT INTO compliance_mappings (framework, control_id, control_name, description, status, evidence_json, updated_by)
           VALUES ($1, $2, $3, $4, 'not_assessed', '[]', $5)
           ON CONFLICT (framework, control_id) DO NOTHING
           RETURNING id`,
          [framework, ctrl.control_id, ctrl.control_name, ctrl.description, authCtx?.userId || "system"]
        );
        if (result.rows.length > 0) seeded++;
      }

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_COMPLIANCE_SEEDED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_LOW",
        summary: `Compliance framework '${framework}' seeded with ${seeded} controls`,
        payload: { framework, seeded, total: controls.length },
      });

      mapleLog("info", "compliance.seeded", { framework, seeded, total: controls.length });

      return c.json({
        ok: true,
        framework,
        seeded,
        total: controls.length,
        skipped: controls.length - seeded,
      });
    } catch (err) {
      mapleLog("error", "compliance.seed_failed", { framework, error: err.message });
      return c.json({ error: "Failed to seed compliance controls", details: err.message }, 500);
    }
  });
}
