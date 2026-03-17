/**
 * firewall-context-leakage-routes.js
 *
 * Phase 5: Context leakage document upload + scan via Cyber Proxy gRPC.
 * POST /api/firewall/context-leakage/documents
 */
import { requireApiKeyResponse } from "../auth-api-key.js";
import { getAuthContext } from "../auth-api-key.js";
import { database, getGrpcClients } from "../state.js";
import { grpcUnary } from "../grpc-clients.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";

export function registerFirewallContextLeakageRoutes(app) {
  app.post("/api/firewall/context-leakage/documents", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const authCtx = getAuthContext(c);
    let documents = [];
    let policyMode = "strict";

    // Handle multipart form data
    try {
      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        policyMode = formData.get("policyMode") || "strict";

        const files = formData.getAll("documents");
        for (const file of files) {
          if (file && typeof file === "object" && file.arrayBuffer) {
            const buffer = await file.arrayBuffer();
            documents.push({
              name: file.name || "unnamed",
              size: buffer.byteLength,
              content: Buffer.from(buffer),
              type: file.type || "application/octet-stream",
            });
          }
        }
      } else {
        // JSON body fallback
        const body = await c.req.json();
        policyMode = body.policyMode || "strict";
        documents = (body.documents || []).map((doc) => ({
          name: doc.name || "unnamed",
          size: doc.content?.length || 0,
          content: Buffer.from(doc.content || "", "utf8"),
          type: doc.type || "text/plain",
        }));
      }
    } catch (err) {
      return c.json({ error: "Failed to parse upload.", details: err.message }, 400);
    }

    if (documents.length === 0) {
      return c.json({ error: "No documents provided." }, 400);
    }

    const results = [];

    // Scan each document via Cyber Proxy gRPC if available
    const grpcClients = getGrpcClients();
    for (const doc of documents) {
      let scanResult = { status: "queued", findings: [] };

      if (grpcClients?.cyberProxy) {
        try {
          const response = await grpcUnary(grpcClients.cyberProxy, "scanContent", {
            content: doc.content,
            contentType: doc.type,
            policyMode,
            metadata: { filename: doc.name, uploadedBy: authCtx?.userId || "unknown" },
          });

          scanResult = {
            status: response?.status || "scanned",
            findings: Array.isArray(response?.findings) ? response.findings : [],
            riskScore: response?.riskScore ?? 0,
            recommendation: response?.recommendation || "No issues detected.",
          };
        } catch (err) {
          mapleLog("warn", "context_leakage.scan_failed", { filename: doc.name, error: err.message });
          scanResult = { status: "scan_unavailable", findings: [], note: "Cyber proxy unavailable" };
        }
      }

      results.push({
        name: doc.name,
        size: doc.size,
        policyMode,
        scan: scanResult,
        uploadedAt: new Date().toISOString(),
      });
    }

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_CONTEXT_LEAKAGE_SCAN",
      sourceService: "gateway-api",
      userId: authCtx?.userId,
      severity: "RISK_SEVERITY_MEDIUM",
      summary: `${documents.length} document(s) scanned for context leakage`,
      payload: {
        documentCount: documents.length,
        policyMode,
        filenames: documents.map((d) => d.name),
      },
    });

    return c.json({
      ok: true,
      scanned: results.length,
      policyMode,
      results,
    });
  });
}
