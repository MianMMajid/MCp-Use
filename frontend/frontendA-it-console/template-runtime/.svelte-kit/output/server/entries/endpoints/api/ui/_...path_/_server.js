function asJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
}
async function parseBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return request.json().catch(() => ({}));
  }
  if (contentType.includes("multipart/form-data")) {
    return request.formData();
  }
  const text = await request.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
async function parseJsonResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
function firstArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}
function normalizeRule(rule, index = 0) {
  return {
    id: String(rule?.id ?? rule?.ruleId ?? `rule-${index + 1}`),
    condition: String(rule?.condition ?? rule?.match ?? rule?.pattern ?? "custom condition"),
    decision: String(rule?.decision ?? rule?.action ?? rule?.effect ?? "review"),
    status: String(rule?.status ?? "enabled"),
    source: String(rule?.source ?? "runtime"),
    createdAt: rule?.createdAt ?? null,
    createdBy: rule?.createdBy ?? null
  };
}
function normalizeUserRow(row, index = 0) {
  const email = String(row?.email ?? "").trim();
  const nameCandidate = String(row?.name ?? row?.username ?? "").trim();
  const name = nameCandidate || (email.includes("@") ? email.split("@")[0] : `user-${index + 1}`);
  return {
    id: String(row?.id ?? row?.userId ?? row?.inviteId ?? `user-row-${index + 1}`),
    userId: String(row?.userId ?? row?.id ?? row?.inviteId ?? `user-${index + 1}`),
    name,
    email: email || `${name.replace(/[^a-z0-9]+/gi, ".").toLowerCase()}@mayple.dev`,
    role: String(row?.role ?? "viewer"),
    status: String(row?.status ?? "active"),
    source: String(row?.source ?? "org")
  };
}
function extractAnalystCandidates(item) {
  if (!item || typeof item !== "object") return [];
  return [
    item.actor,
    item.requestedBy,
    item.approvedBy,
    item.reviewer,
    item.user,
    item.username,
    item.email,
    item.owner,
    item?.metadata?.actor,
    item?.metadata?.user,
    item?.metadata?.requestedBy
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
}
async function requestJson(event, path, init = {}) {
  const response = await event.fetch(path, init);
  const payload = await parseJsonResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}
async function resolveOrgId(event, explicitOrgId = "") {
  if (explicitOrgId && explicitOrgId !== "default") return explicitOrgId;
  const orgResponse = await requestJson(event, "/api/org");
  if (!orgResponse.ok) return "default";
  const orgs = firstArray(orgResponse.payload, ["orgs", "items"]);
  return String(orgs[0]?.id ?? orgs[0]?.orgId ?? "default");
}
async function loadUsers(event, orgId) {
  const [membersRes, invitesRes] = await Promise.all([
    requestJson(event, `/api/org/${encodeURIComponent(orgId)}/members`),
    requestJson(event, `/api/org/${encodeURIComponent(orgId)}/invites`)
  ]);
  const members = firstArray(membersRes.payload, ["members", "items"]).map(
    (member, index) => normalizeUserRow({ ...member, status: "active", source: "org-member" }, index)
  );
  const invites = firstArray(invitesRes.payload, ["invites", "items"]).map(
    (invite, index) => normalizeUserRow(
      {
        id: invite.id ?? invite.inviteId,
        userId: invite.inviteId ?? invite.id,
        name: invite.email,
        email: invite.email,
        role: invite.role ?? "viewer",
        status: invite.status ?? "pending",
        source: "invite"
      },
      index
    )
  );
  return [...members, ...invites];
}
async function buildBootstrap(event) {
  const settled = await Promise.allSettled([
    requestJson(event, "/api/observability/orchestrations/summary"),
    requestJson(event, "/api/observability/orchestrations/slo"),
    requestJson(event, "/api/observability/orchestrations/audit-log?offset=0&limit=50"),
    requestJson(event, "/api/orchestrations/executions?limit=50"),
    requestJson(event, "/api/orchestrations/executions/approvals?status=pending&limit=50"),
    requestJson(event, "/api/runtime/feature-capabilities"),
    requestJson(event, "/api/integrations/catalog"),
    requestJson(event, "/api/integrations"),
    requestJson(event, "/api/downstream/apps"),
    requestJson(event, "/api/downstream/tools"),
    requestJson(event, "/api/openclaw/cli/catalog"),
    requestJson(event, "/api/auth/me"),
    requestJson(event, "/api/firewall/rules/effective")
  ]);
  const getPayload = (index) => settled[index]?.status === "fulfilled" && settled[index].value.ok ? settled[index].value.payload : {};
  const summary = getPayload(0);
  const slo = getPayload(1);
  const audit = getPayload(2);
  const executions = getPayload(3);
  const approvals = getPayload(4);
  const runtimeCapabilities = getPayload(5);
  const integrationCatalog = getPayload(6);
  const connectedIntegrations = getPayload(7);
  const downstreamApps = getPayload(8);
  const downstreamTools = getPayload(9);
  const openclawCatalog = getPayload(10);
  const authMe = getPayload(11);
  const firewallRulesRaw = getPayload(12);
  return {
    summary,
    slo,
    auditEvents: firstArray(audit, ["items", "entries", "events"]),
    executions: firstArray(executions, ["items", "executions"]),
    approvals: firstArray(approvals, ["items", "approvals", "entries"]),
    runtimeCapabilities: firstArray(runtimeCapabilities, ["items", "capabilities"]).length > 0 ? firstArray(runtimeCapabilities, ["items", "capabilities"]) : Array.isArray(runtimeCapabilities) ? runtimeCapabilities : [],
    integrationCatalog: firstArray(integrationCatalog, ["integrations", "items"]),
    connectedIntegrations: firstArray(connectedIntegrations, ["integrations", "items"]),
    downstreamApps: firstArray(downstreamApps, ["apps", "items"]),
    downstreamTools: firstArray(downstreamTools, ["tools", "items"]),
    openclawCatalog: firstArray(openclawCatalog, ["catalog", "items"]),
    authMe: authMe?.user ?? null,
    firewallRules: firstArray(firewallRulesRaw, ["rules", "items", "effective"]).map(normalizeRule)
  };
}
async function GET(event) {
  const pathParts = String(event.params.path || "").split("/").filter(Boolean);
  if (pathParts.length === 1 && pathParts[0] === "bootstrap") {
    const bootstrap = await buildBootstrap(event);
    return asJson(bootstrap);
  }
  if (pathParts.length === 1 && pathParts[0] === "analysts") {
    const bootstrap = await buildBootstrap(event);
    const analysts = Array.from(
      new Set(
        [
          bootstrap.authMe?.username,
          bootstrap.authMe?.email,
          ...bootstrap.auditEvents.flatMap((item) => extractAnalystCandidates(item)),
          ...bootstrap.executions.flatMap((item) => extractAnalystCandidates(item)),
          ...bootstrap.approvals.flatMap((item) => extractAnalystCandidates(item))
        ].filter(Boolean)
      )
    ).sort((a, b) => String(a).localeCompare(String(b)));
    return asJson({ analysts });
  }
  if (pathParts.length === 1 && pathParts[0] === "users") {
    const orgId = await resolveOrgId(event, event.url.searchParams.get("orgId") || "");
    const users = await loadUsers(event, orgId);
    return asJson({ orgId, users });
  }
  if (pathParts.length === 2 && pathParts[0] === "firewall" && pathParts[1] === "rules") {
    const response = await requestJson(event, "/api/firewall/rules/effective");
    if (!response.ok) {
      return asJson({ message: "Unable to load firewall rules." }, response.status);
    }
    return asJson({ rules: firstArray(response.payload, ["rules", "items", "effective"]).map(normalizeRule) });
  }
  return asJson({ message: "Not found" }, 404);
}
async function POST(event) {
  const pathParts = String(event.params.path || "").split("/").filter(Boolean);
  const body = await parseBody(event.request);
  if (pathParts.length === 1 && pathParts[0] === "users") {
    const orgId = await resolveOrgId(event, event.url.searchParams.get("orgId") || "");
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const inviteRes = await requestJson(event, `/api/org/${encodeURIComponent(orgId)}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: payload.email,
        name: payload.name,
        role: payload.role
      })
    });
    if (!inviteRes.ok) {
      return asJson({ message: "Unable to create user invite.", details: inviteRes.payload }, inviteRes.status);
    }
    const invite = inviteRes.payload?.invite ?? inviteRes.payload;
    const user = normalizeUserRow({
      id: invite?.id ?? invite?.inviteId,
      userId: invite?.inviteId ?? invite?.id,
      name: payload.name ?? invite?.email,
      email: invite?.email ?? payload.email,
      role: payload.role ?? "viewer",
      status: invite?.status ?? "pending",
      source: "invite"
    });
    return asJson({ ok: true, user, orgId });
  }
  if (pathParts.length === 2 && pathParts[0] === "firewall" && pathParts[1] === "rules") {
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const response = await requestJson(event, "/api/firewall/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return asJson(
        {
          message: "Unable to create firewall rule via backend.",
          typedError: "BACKEND_RULE_CREATE_UNAVAILABLE",
          details: response.payload
        },
        response.status
      );
    }
    const inserted = normalizeRule(response.payload?.rule ?? response.payload);
    return asJson({ ok: true, rule: inserted });
  }
  if (pathParts.length === 3 && pathParts[0] === "firewall" && pathParts[1] === "context-leakage" && pathParts[2] === "documents") {
    const form = body instanceof FormData ? body : new FormData();
    const response = await event.fetch("/api/firewall/context-leakage/documents", {
      method: "POST",
      body: form
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      return asJson({ message: "Unable to upload leakage documents.", details: payload }, response.status);
    }
    return asJson({ ok: true, ...payload });
  }
  if (pathParts.length === 2 && pathParts[0] === "marketplace" && pathParts[1] === "dispatch") {
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const response = await requestJson(event, "/api/downstream/dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return asJson({ message: "Dispatch failed.", details: response.payload }, response.status);
    }
    return asJson({ ok: true, result: response.payload?.result ?? response.payload });
  }
  if (pathParts.length === 2 && pathParts[0] === "chat" && pathParts[1] === "send") {
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const primary = await requestJson(event, "/api/firewall/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: payload.message ?? payload.prompt ?? "" })
    });
    if (primary.ok) {
      return asJson({
        ok: true,
        reply: primary.payload?.reply ?? primary.payload?.message ?? primary.payload?.answer ?? "No response message."
      });
    }
    const fallback = await requestJson(event, "/api/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: payload.message ?? payload.prompt ?? "" })
    });
    if (!fallback.ok) {
      return asJson({ message: "Monitoring chat unavailable.", details: fallback.payload }, fallback.status);
    }
    return asJson({
      ok: true,
      reply: fallback.payload?.reply ?? fallback.payload?.message ?? fallback.payload?.answer ?? "Chat request accepted."
    });
  }
  if (pathParts.length === 2 && pathParts[0] === "intervention") {
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const executionId = String(payload.executionId ?? "").trim();
    const sessionId = String(payload.sessionId ?? "").trim();
    if (pathParts[1] === "pause") {
      if (!executionId) return asJson({ message: "executionId is required." }, 400);
      const response = await requestJson(event, `/api/orchestrations/executions/${encodeURIComponent(executionId)}/pause`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken: payload.challengeToken ?? "" })
      });
      return asJson(response.payload, response.ok ? 200 : response.status);
    }
    if (pathParts[1] === "resume") {
      if (!executionId) return asJson({ message: "executionId is required." }, 400);
      const response = await requestJson(event, `/api/orchestrations/executions/${encodeURIComponent(executionId)}/resume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken: payload.challengeToken ?? "" })
      });
      return asJson(response.payload, response.ok ? 200 : response.status);
    }
    if (pathParts[1] === "cancel") {
      if (!executionId && !sessionId) return asJson({ message: "executionId or sessionId is required." }, 400);
      if (executionId) {
        const response2 = await requestJson(event, `/api/orchestrations/executions/${encodeURIComponent(executionId)}/cancel`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: payload.reason ?? "", challengeToken: payload.challengeToken ?? "" })
        });
        return asJson(response2.payload, response2.ok ? 200 : response2.status);
      }
      const response = await requestJson(event, `/api/openclaw/agent/sessions/${encodeURIComponent(sessionId)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: payload.reason ?? "", challengeToken: payload.challengeToken ?? "" })
      });
      return asJson(response.payload, response.ok ? 200 : response.status);
    }
    if (pathParts[1] === "block-rule") {
      const target = String(payload.target ?? "").trim();
      if (!target) return asJson({ message: "target is required." }, 400);
      const response = await requestJson(event, "/api/firewall/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          condition: `target equals ${target}`,
          decision: "block + escalate",
          reason: payload.reason ?? "",
          source: "intervention",
          createdBy: payload.createdBy ?? "operator"
        })
      });
      if (!response.ok) {
        return asJson({ message: "Unable to create block rule.", details: response.payload }, response.status);
      }
      return asJson({ ok: true, rule: normalizeRule(response.payload?.rule ?? response.payload) });
    }
  }
  if (pathParts.length === 1 && pathParts[0] === "refresh") {
    return asJson({ ok: true, refreshedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  return asJson({ message: "Not found" }, 404);
}
async function PATCH(event) {
  const pathParts = String(event.params.path || "").split("/").filter(Boolean);
  const body = await parseBody(event.request);
  if (pathParts.length === 3 && pathParts[0] === "users" && pathParts[2] === "role") {
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const orgId = await resolveOrgId(event, event.url.searchParams.get("orgId") || "");
    const roleValue = String(payload.role ?? "").trim();
    const roleLookup = await requestJson(event, `/api/org/${encodeURIComponent(orgId)}/roles`);
    const roles = firstArray(roleLookup.payload, ["roles", "items"]);
    const matchedRole = roles.find(
      (role) => String(role.name ?? "").toLowerCase() === roleValue.toLowerCase() || String(role.id ?? role.roleId ?? "") === roleValue
    );
    const roleId = String(matchedRole?.id ?? matchedRole?.roleId ?? roleValue ?? "role-viewer");
    const response = await requestJson(
      event,
      `/api/org/${encodeURIComponent(orgId)}/roles/${encodeURIComponent(roleId)}/assign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: pathParts[1] })
      }
    );
    if (!response.ok) {
      return asJson({ message: "Unable to change user role.", details: response.payload }, response.status);
    }
    return asJson({ ok: true, userId: pathParts[1], role: roleValue || roleId, orgId });
  }
  if (pathParts.length === 3 && pathParts[0] === "firewall" && pathParts[1] === "rules") {
    const payload = body && typeof body === "object" && !(body instanceof FormData) ? body : {};
    const response = await requestJson(event, `/api/firewall/rules/${encodeURIComponent(pathParts[2])}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return asJson({ message: "Unable to update firewall rule.", details: response.payload }, response.status);
    }
    return asJson({ ok: true, rule: normalizeRule(response.payload?.rule ?? response.payload) });
  }
  return asJson({ message: "Not found" }, 404);
}
async function DELETE(event) {
  const pathParts = String(event.params.path || "").split("/").filter(Boolean);
  if (pathParts.length === 2 && pathParts[0] === "users") {
    const orgId = await resolveOrgId(event, event.url.searchParams.get("orgId") || "");
    const response = await requestJson(event, `/api/org/${encodeURIComponent(orgId)}/members/${encodeURIComponent(pathParts[1])}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      return asJson({ message: "Unable to delete user.", details: response.payload }, response.status);
    }
    return asJson({ ok: true, userId: pathParts[1], orgId });
  }
  if (pathParts.length === 3 && pathParts[0] === "firewall" && pathParts[1] === "rules") {
    const response = await requestJson(event, `/api/firewall/rules/${encodeURIComponent(pathParts[2])}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      return asJson({ message: "Unable to delete firewall rule.", details: response.payload }, response.status);
    }
    return asJson({ ok: true, ruleId: pathParts[2] });
  }
  return asJson({ message: "Not found" }, 404);
}
export {
  DELETE,
  GET,
  PATCH,
  POST
};
