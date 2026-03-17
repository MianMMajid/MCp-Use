/**
 * rbac-routes.js
 *
 * CRUD endpoints for custom RBAC roles and user assignment.
 */
import { requireApiKeyResponse } from "../auth-api-key.js";
import { getAuthContext } from "../auth-api-key.js";
import { checkPermission, getRbacStore } from "../middleware/rbac-middleware.js";
import { database } from "../state.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";

export function registerRbacRoutes(app) {
  // ── List all permissions ──────────────────────────────────────────────
  app.get("/api/rbac/permissions", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const store = getRbacStore();
    if (!store) return c.json({ ok: true, items: [] });

    const items = await store.listPermissions();
    return c.json({ ok: true, items });
  });

  // ── List roles ────────────────────────────────────────────────────────
  app.get("/api/rbac/roles", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const store = getRbacStore();
    if (!store) return c.json({ ok: true, items: [] });

    const orgId = c.req.query("orgId") || null;
    const items = await store.listRoles(orgId);
    return c.json({ ok: true, items, rbacVersion: store.version });
  });

  // ── Get single role ───────────────────────────────────────────────────
  app.get("/api/rbac/roles/:roleId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const store = getRbacStore();
    if (!store) return c.json({ error: "RBAC not initialized" }, 503);

    const roleId = asString(c.req.param("roleId"));
    const role = await store.getRole(roleId);
    if (!role) return c.json({ error: "Role not found." }, 404);

    return c.json({ ok: true, role });
  });

  // ── Create custom role ────────────────────────────────────────────────
  app.post("/api/rbac/roles", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const denied = await checkPermission(c, "org.roles", "assign");
    if (denied) return denied;

    const store = getRbacStore();
    if (!store) return c.json({ error: "RBAC not initialized" }, 503);

    const body = await readJsonBody(c);
    const label = asString(body.label);
    if (!label) return c.json({ error: "label is required." }, 400);

    const role = await store.createCustomRole({
      orgId: asString(body.orgId) || null,
      label,
      description: asString(body.description) || "",
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
    });

    const authCtx = getAuthContext(c);
    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_RBAC_ROLE_CREATED",
      sourceService: "gateway-api",
      userId: authCtx?.userId,
      severity: "RISK_SEVERITY_MEDIUM",
      summary: `Custom role '${label}' created`,
      payload: { roleId: role.roleId, label, permissions: role.permissions },
    });

    c.header("X-Maple-Rbac-Version", String(store.version));
    return c.json({ ok: true, role }, 201);
  });

  // ── Update custom role ────────────────────────────────────────────────
  app.patch("/api/rbac/roles/:roleId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const denied = await checkPermission(c, "org.roles", "assign");
    if (denied) return denied;

    const store = getRbacStore();
    if (!store) return c.json({ error: "RBAC not initialized" }, 503);

    const roleId = asString(c.req.param("roleId"));
    const body = await readJsonBody(c);

    try {
      const updated = await store.updateCustomRole(roleId, {
        label: body.label !== undefined ? asString(body.label) : undefined,
        description: body.description !== undefined ? asString(body.description) : undefined,
        permissions: Array.isArray(body.permissions) ? body.permissions : undefined,
      });

      if (!updated) return c.json({ error: "Role not found." }, 404);

      const authCtx = getAuthContext(c);
      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_RBAC_ROLE_UPDATED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_MEDIUM",
        summary: `Custom role '${updated.label}' updated`,
        payload: { roleId, updates: body },
      });

      c.header("X-Maple-Rbac-Version", String(store.version));
      return c.json({ ok: true, role: updated });
    } catch (err) {
      if (err.message.includes("system roles")) {
        return c.json({ error: err.message }, 403);
      }
      throw err;
    }
  });

  // ── Delete custom role ────────────────────────────────────────────────
  app.delete("/api/rbac/roles/:roleId", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const denied = await checkPermission(c, "org.roles", "assign");
    if (denied) return denied;

    const store = getRbacStore();
    if (!store) return c.json({ error: "RBAC not initialized" }, 503);

    const roleId = asString(c.req.param("roleId"));

    try {
      const deleted = await store.deleteCustomRole(roleId);
      if (!deleted) return c.json({ error: "Role not found." }, 404);

      const authCtx = getAuthContext(c);
      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_RBAC_ROLE_DELETED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `Custom role deleted`,
        payload: { roleId },
      });

      c.header("X-Maple-Rbac-Version", String(store.version));
      return c.json({ ok: true, roleId });
    } catch (err) {
      if (err.message.includes("system roles")) {
        return c.json({ error: err.message }, 403);
      }
      throw err;
    }
  });

  // ── Assign user to role ───────────────────────────────────────────────
  app.post("/api/rbac/users/:userId/role", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const denied = await checkPermission(c, "org.roles", "assign");
    if (denied) return denied;

    const store = getRbacStore();
    if (!store) return c.json({ error: "RBAC not initialized" }, 503);

    const targetUserId = asString(c.req.param("userId"));
    const body = await readJsonBody(c);
    const roleId = asString(body.roleId);
    if (!roleId) return c.json({ error: "roleId is required." }, 400);

    const authCtx = getAuthContext(c);

    // Self-demotion prevention: owner cannot remove own owner role
    if (targetUserId === authCtx?.userId) {
      const currentLabel = await store.getUserRoleLabel(targetUserId);
      const targetRole = await store.getRole(roleId);
      if (currentLabel === "owner" && targetRole?.label !== "owner") {
        return c.json({
          error: "Cannot demote yourself from owner role. Transfer ownership first.",
        }, 403);
      }
    }

    try {
      const result = await store.assignUserRole(targetUserId, roleId);

      emitAuditEvent({
        eventType: "AUDIT_EVENT_TYPE_RBAC_USER_ROLE_CHANGED",
        sourceService: "gateway-api",
        userId: authCtx?.userId,
        severity: "RISK_SEVERITY_HIGH",
        summary: `User ${targetUserId} assigned role '${result.roleLabel}'`,
        payload: { targetUserId, roleId, roleLabel: result.roleLabel, assignedBy: authCtx?.userId },
      });

      c.header("X-Maple-Rbac-Version", String(store.version));
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  });

  // ── Get user's effective permissions ──────────────────────────────────
  app.get("/api/rbac/users/:userId/permissions", async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) return unauthorized;

    const store = getRbacStore();
    if (!store) return c.json({ ok: true, permissions: [], roleLabel: "member" });

    const targetUserId = asString(c.req.param("userId"));
    const orgId = c.req.query("orgId") || null;

    const permissions = await store.resolveEffectivePermissions(targetUserId, orgId);
    const roleLabel = await store.getUserRoleLabel(targetUserId);

    c.header("X-Maple-Rbac-Version", String(store.version));
    return c.json({
      ok: true,
      userId: targetUserId,
      roleLabel,
      permissions: [...permissions].sort(),
      rbacVersion: store.version,
    });
  });
}
