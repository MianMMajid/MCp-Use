/**
 * permissions.js
 *
 * Reactive permission helper for the frontend.
 * Fetches user permissions from /api/auth/me and provides a
 * `can(resource, action)` function for conditional UI rendering.
 */

/** @type {Set<string>} */
let _permissions = new Set();
let _roleLabel = "member";
let _rbacVersion = 0;
let _loaded = false;
let _loading = false;

/** @type {Array<() => void>} */
const _subscribers = [];

/**
 * Load permissions from the auth/me + rbac endpoint.
 * Called once on mount, and again when RBAC version changes.
 */
export async function loadPermissions(userId) {
  if (_loading) return;
  _loading = true;

  try {
    // First get user info
    const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!meRes.ok) {
      _permissions = new Set();
      _roleLabel = "member";
      _loaded = true;
      _loading = false;
      notify();
      return;
    }

    const me = await meRes.json();
    const effectiveUserId = userId || me?.user?.id;

    if (!effectiveUserId) {
      // API key auth or unauthenticated — grant admin-like permissions
      if (me?.method === "api_key") {
        _permissions = new Set(["*"]);
        _roleLabel = "admin";
      } else {
        _permissions = new Set();
        _roleLabel = "member";
      }
      _loaded = true;
      _loading = false;
      notify();
      return;
    }

    // Fetch effective permissions
    const permRes = await fetch(`/api/rbac/users/${encodeURIComponent(effectiveUserId)}/permissions`, {
      credentials: "same-origin",
    });

    if (permRes.ok) {
      const data = await permRes.json();
      _permissions = new Set(data.permissions ?? []);
      _roleLabel = data.roleLabel ?? "member";
      _rbacVersion = data.rbacVersion ?? 0;
    } else {
      // RBAC endpoints not available — fall back to role-based defaults
      const role = me?.user?.role ?? "member";
      _roleLabel = role;
      _permissions = defaultPermissionsForRole(role);
    }
  } catch {
    // Network error — use empty permissions (most restrictive)
    _permissions = new Set();
    _roleLabel = "member";
  }

  _loaded = true;
  _loading = false;
  notify();
}

/**
 * Check if the current user has a specific permission.
 * Returns true if user has the permission, or if permissions
 * haven't loaded yet (optimistic rendering to avoid flash).
 *
 * @param {string} resource
 * @param {string} action
 * @returns {boolean}
 */
export function can(resource, action) {
  if (!_loaded) return true; // Optimistic until loaded
  if (_permissions.has("*")) return true;
  return _permissions.has(`${resource}:${action}`);
}

/**
 * Check if the current user has any of the given permissions.
 * @param {Array<[string, string]>} permissionPairs - Array of [resource, action] pairs
 * @returns {boolean}
 */
export function canAny(permissionPairs) {
  if (!_loaded) return true;
  if (_permissions.has("*")) return true;
  return permissionPairs.some(([resource, action]) => _permissions.has(`${resource}:${action}`));
}

/**
 * Get the current user's role label.
 * @returns {string}
 */
export function getRoleLabel() {
  return _roleLabel;
}

/**
 * Get the current RBAC version for cache coordination.
 * @returns {number}
 */
export function getRbacVersion() {
  return _rbacVersion;
}

/**
 * Check if permissions have been loaded.
 * @returns {boolean}
 */
export function permissionsLoaded() {
  return _loaded;
}

/**
 * Get all current permissions as an array.
 * @returns {string[]}
 */
export function getAllPermissions() {
  return [..._permissions];
}

/**
 * Force reload permissions (e.g., after receiving X-Maple-Rbac-Version mismatch).
 */
export function reloadPermissions(userId) {
  _loaded = false;
  _loading = false;
  return loadPermissions(userId);
}

/**
 * Subscribe to permission changes.
 * @param {() => void} callback
 * @returns {() => void} unsubscribe function
 */
export function onPermissionChange(callback) {
  _subscribers.push(callback);
  return () => {
    const idx = _subscribers.indexOf(callback);
    if (idx >= 0) _subscribers.splice(idx, 1);
  };
}

/** @param {string} legacyRole */
function defaultPermissionsForRole(legacyRole) {
  const readAll = [
    "org:read", "org.members:read", "org.roles:read",
    "policy:read", "firewall:read", "user:read",
    "audit:read", "trace:read", "orchestration:read",
    "integration:read", "apikey:read", "service_account:read",
    "sso:read", "scim:read", "billing:read",
    "risk:read", "compliance:read", "dashboard:read",
  ];

  switch (legacyRole) {
    case "owner":
    case "admin":
      return new Set(["*"]);
    case "operator":
      return new Set([
        ...readAll,
        "policy:simulate", "firewall:create", "firewall:update",
        "firewall.leakage:scan", "trace:share",
        "orchestration:execute", "orchestration:approve", "orchestration:cancel",
        "apikey:create", "apikey:delete", "dashboard:customize",
      ]);
    case "viewer":
      return new Set(readAll);
    default: // member
      return new Set([
        "org:read", "org.members:read", "policy:read", "firewall:read",
        "audit:read", "trace:read", "orchestration:read",
        "apikey:read", "apikey:create", "apikey:delete",
        "dashboard:read", "dashboard:customize",
      ]);
  }
}

function notify() {
  for (const cb of _subscribers) {
    try { cb(); } catch { /* ignore */ }
  }
}

/**
 * Permission requirements for workspace categories.
 * Used by MapleShell to filter visible navigation.
 */
export const CATEGORY_PERMISSIONS = Object.freeze({
  chat: null, // always visible
  observe: [["audit", "read"]],
  admin: [["admin", "access"]],
  firewalls: [["firewall", "read"]],
  users: [["user", "read"]],
  compliance: [["compliance", "read"]],
  docs: null, // always visible
});

/**
 * Check if a workspace category should be visible to the current user.
 * @param {string} categoryId
 * @returns {boolean}
 */
export function canAccessCategory(categoryId) {
  const required = CATEGORY_PERMISSIONS[categoryId];
  if (!required) return true;
  return canAny(required);
}
