/**
 * rbac-middleware.js
 *
 * Hono middleware that enforces permission checks on routes.
 * Reads auth context from the request, resolves effective permissions
 * via RbacStore, and returns 403 on denial.
 */
import { getAuthContext } from "../auth-api-key.js";
import { apiErrorPayload } from "../api-error.js";
import { mapleLog } from "../logging.js";

let _rbacStore = null;

/** Set the shared RbacStore instance (called during app bootstrap) */
export function setRbacStore(store) {
  _rbacStore = store;
}

/** Get the shared RbacStore instance */
export function getRbacStore() {
  return _rbacStore;
}

/**
 * Create a Hono middleware that checks a specific permission.
 *
 * Usage:
 *   app.post("/api/firewall/rules", requirePermission("firewall", "create"), handler)
 *
 * The middleware:
 * 1. Reads the auth context (set by requireApiKeyResponse)
 * 2. If auth bypass is active (dev mode), allows through
 * 3. Resolves effective permissions for the authenticated user
 * 4. Returns 403 if the required permission is missing
 * 5. Sets X-Maple-Rbac-Version header for cache invalidation
 */
/**
 * Standalone permission check — returns null if allowed, or a Response if denied.
 * Use this in route handlers: `const denied = await checkPermission(c, "policy", "read"); if (denied) return denied;`
 */
export async function checkPermission(c, resource, action) {
  const authCtx = getAuthContext(c);
  if (!authCtx) {
    return c.json({ ...apiErrorPayload("FORBIDDEN", "Permission denied"), requiredPermission: `${resource}:${action}` }, 403);
  }
  if (authCtx.authBypass) return null;
  if (authCtx.method === "api_key" && authCtx.role === "admin") return null;
  if (!_rbacStore) {
    return checkLegacyRole(authCtx.role, resource, action) ? null :
      c.json({ ...apiErrorPayload("FORBIDDEN", "Permission denied"), requiredPermission: `${resource}:${action}` }, 403);
  }
  const userId = authCtx.userId;
  if (!userId) {
    return checkLegacyRole(authCtx.role, resource, action) ? null :
      c.json({ ...apiErrorPayload("FORBIDDEN", "Permission denied"), requiredPermission: `${resource}:${action}` }, 403);
  }
  const has = await _rbacStore.hasPermission(userId, resource, action);
  if (_rbacStore) c.header("X-Maple-Rbac-Version", String(_rbacStore.version));
  if (!has) {
    return c.json({
      ...apiErrorPayload("FORBIDDEN", "Permission denied"),
      requiredPermission: `${resource}:${action}`,
      hint: `You need the '${resource}:${action}' permission to perform this action.`,
    }, 403);
  }
  return null;
}

export function requirePermission(resource, action) {
  return async (c, next) => {
    const authCtx = getAuthContext(c);

    // No auth context means the auth middleware hasn't run yet or failed
    if (!authCtx) {
      return c.json(
        {
          ...apiErrorPayload("FORBIDDEN", "Permission denied"),
          requiredPermission: `${resource}:${action}`,
          hint: "Authentication is required before permission checks.",
        },
        403
      );
    }

    // Auth bypass in dev mode — allow everything
    if (authCtx.authBypass) {
      await next();
      return;
    }

    // API key auth with admin role gets full access (backward compat)
    if (authCtx.method === "api_key" && authCtx.role === "admin") {
      await next();
      return;
    }

    // Service accounts get operator-level access by default
    if (authCtx.method === "generated_api_key" && authCtx.role === "service_account") {
      const operatorPermissions = new Set([
        "org:read", "org.members:read", "org.roles:read",
        "policy:read", "policy:simulate",
        "firewall:read", "firewall:create", "firewall:update", "firewall.leakage:scan",
        "user:read",
        "audit:read",
        "trace:read", "trace:share",
        "orchestration:read", "orchestration:execute", "orchestration:approve", "orchestration:cancel",
        "integration:read",
        "apikey:read", "apikey:create", "apikey:delete",
        "risk:read", "compliance:read",
        "dashboard:read", "dashboard:customize",
      ]);
      if (operatorPermissions.has(`${resource}:${action}`)) {
        await next();
        return;
      }
    }

    // Resolve permissions via RBAC store
    if (!_rbacStore) {
      // RBAC store not initialized — fall back to legacy role check
      const legacyAllow = checkLegacyRole(authCtx.role, resource, action);
      if (legacyAllow) {
        await next();
        return;
      }
      return c.json(
        {
          ...apiErrorPayload("FORBIDDEN", "Permission denied"),
          requiredPermission: `${resource}:${action}`,
        },
        403
      );
    }

    const userId = authCtx.userId;
    if (!userId) {
      // No user ID (e.g., API key without user binding) — check legacy role
      const legacyAllow = checkLegacyRole(authCtx.role, resource, action);
      if (legacyAllow) {
        await next();
        return;
      }
      return c.json(
        {
          ...apiErrorPayload("FORBIDDEN", "Permission denied"),
          requiredPermission: `${resource}:${action}`,
        },
        403
      );
    }

    // Check client-side RBAC version for cache coherence
    const clientVersion = Number(c.req.header("x-maple-rbac-version"));
    if (!Number.isNaN(clientVersion) && _rbacStore.forceRefreshIfStale(clientVersion)) {
      mapleLog("debug", "rbac.cache_refresh_forced", { userId, clientVersion, serverVersion: _rbacStore.version });
    }

    const hasPermission = await _rbacStore.hasPermission(userId, resource, action);

    // Set version header for client-side cache coordination
    c.header("X-Maple-Rbac-Version", String(_rbacStore.version));

    if (!hasPermission) {
      mapleLog("info", "rbac.permission_denied", {
        userId,
        resource,
        action,
        requiredPermission: `${resource}:${action}`,
      });
      return c.json(
        {
          ...apiErrorPayload("FORBIDDEN", "Permission denied"),
          requiredPermission: `${resource}:${action}`,
          hint: `You need the '${resource}:${action}' permission to perform this action.`,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Legacy role-based check for backward compatibility when RBAC store
 * is not available or user has no custom role assigned.
 */
function checkLegacyRole(role, resource, action) {
  if (!role) return false;

  // Admin/owner gets everything
  if (role === "admin" || role === "owner") return true;

  // User/member gets read access + some create actions
  if (role === "user" || role === "member") {
    if (action === "read") return true;
    if (resource === "apikey" && ["create", "delete"].includes(action)) return true;
    if (resource === "dashboard" && action === "customize") return true;
    if (resource === "trace" && action === "share") return true;
    return false;
  }

  // Operator gets most things except admin-only
  if (role === "operator") {
    if (["admin.limits:override", "billing:manage", "sso:configure", "scim:configure"].includes(`${resource}:${action}`)) {
      return false;
    }
    return true;
  }

  // Viewer gets read-only
  if (role === "viewer") {
    return action === "read";
  }

  return false;
}
