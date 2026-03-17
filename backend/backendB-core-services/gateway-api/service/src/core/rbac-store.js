/**
 * rbac-store.js
 *
 * Custom RBAC store for role and permission management.
 * Provides in-memory caching with version-based invalidation.
 */
import { randomUUID } from "node:crypto";
import { mapleLog } from "../logging.js";

const CACHE_TTL_MS = 30_000;

const SYSTEM_PERMISSIONS = Object.freeze([
  // Organization management
  { resource: "org", action: "read" },
  { resource: "org", action: "create" },
  { resource: "org", action: "update" },
  { resource: "org", action: "delete" },
  { resource: "org.members", action: "read" },
  { resource: "org.members", action: "invite" },
  { resource: "org.members", action: "remove" },
  { resource: "org.roles", action: "read" },
  { resource: "org.roles", action: "assign" },
  // Policy management
  { resource: "policy", action: "read" },
  { resource: "policy", action: "create" },
  { resource: "policy", action: "update" },
  { resource: "policy", action: "delete" },
  { resource: "policy", action: "simulate" },
  // Firewall
  { resource: "firewall", action: "read" },
  { resource: "firewall", action: "create" },
  { resource: "firewall", action: "update" },
  { resource: "firewall", action: "delete" },
  { resource: "firewall.leakage", action: "scan" },
  // Users
  { resource: "user", action: "read" },
  { resource: "user", action: "create" },
  { resource: "user", action: "update" },
  { resource: "user", action: "delete" },
  { resource: "user.mfa", action: "manage" },
  { resource: "user.mfa", action: "enforce" },
  // Audit
  { resource: "audit", action: "read" },
  { resource: "audit", action: "export" },
  // Traces
  { resource: "trace", action: "read" },
  { resource: "trace", action: "share" },
  // Orchestration
  { resource: "orchestration", action: "read" },
  { resource: "orchestration", action: "create" },
  { resource: "orchestration", action: "execute" },
  { resource: "orchestration", action: "approve" },
  { resource: "orchestration", action: "cancel" },
  // Integrations
  { resource: "integration", action: "read" },
  { resource: "integration", action: "connect" },
  { resource: "integration", action: "disconnect" },
  // API keys
  { resource: "apikey", action: "read" },
  { resource: "apikey", action: "create" },
  { resource: "apikey", action: "delete" },
  // Service accounts
  { resource: "service_account", action: "read" },
  { resource: "service_account", action: "create" },
  { resource: "service_account", action: "delete" },
  // SSO
  { resource: "sso", action: "read" },
  { resource: "sso", action: "configure" },
  // SCIM
  { resource: "scim", action: "read" },
  { resource: "scim", action: "configure" },
  // Admin
  { resource: "admin", action: "access" },
  { resource: "admin.limits", action: "override" },
  // Billing
  { resource: "billing", action: "read" },
  { resource: "billing", action: "manage" },
  // Risk & Compliance
  { resource: "risk", action: "read" },
  { resource: "compliance", action: "read" },
  { resource: "compliance", action: "update" },
  // Dashboard
  { resource: "dashboard", action: "read" },
  { resource: "dashboard", action: "customize" },
]);

/** All permissions as a flat "resource:action" set */
const ALL_PERMISSION_KEYS = new Set(
  SYSTEM_PERMISSIONS.map((p) => `${p.resource}:${p.action}`)
);

/** System role definitions — these are seeded on first run */
const SYSTEM_ROLES = Object.freeze([
  {
    label: "owner",
    is_system: true,
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    label: "admin",
    is_system: true,
    permissions: SYSTEM_PERMISSIONS.filter(
      (p) =>
        !["admin.limits:override", "billing:manage", "scim:configure", "sso:configure"].includes(
          `${p.resource}:${p.action}`
        )
    ).map((p) => `${p.resource}:${p.action}`),
  },
  {
    label: "operator",
    is_system: true,
    permissions: SYSTEM_PERMISSIONS.filter((p) =>
      [
        "org:read",
        "org.members:read",
        "org.roles:read",
        "policy:read",
        "policy:simulate",
        "firewall:read",
        "firewall:create",
        "firewall:update",
        "firewall.leakage:scan",
        "user:read",
        "audit:read",
        "trace:read",
        "trace:share",
        "orchestration:read",
        "orchestration:execute",
        "orchestration:approve",
        "orchestration:cancel",
        "integration:read",
        "apikey:read",
        "apikey:create",
        "apikey:delete",
        "risk:read",
        "compliance:read",
        "dashboard:read",
        "dashboard:customize",
      ].includes(`${p.resource}:${p.action}`)
    ).map((p) => `${p.resource}:${p.action}`),
  },
  {
    label: "viewer",
    is_system: true,
    permissions: SYSTEM_PERMISSIONS.filter((p) => p.action === "read").map(
      (p) => `${p.resource}:${p.action}`
    ),
  },
  {
    label: "member",
    is_system: true,
    permissions: [
      "org:read",
      "org.members:read",
      "policy:read",
      "firewall:read",
      "audit:read",
      "trace:read",
      "orchestration:read",
      "apikey:read",
      "apikey:create",
      "apikey:delete",
      "dashboard:read",
      "dashboard:customize",
    ],
  },
]);

/** Map legacy role strings to system role labels */
const LEGACY_ROLE_MAP = Object.freeze({
  owner: "owner",
  admin: "admin",
  user: "member",
  member: "member",
  service_account: "operator",
});

export class RbacStore {
  #database;
  #version = 0;
  #cache = new Map(); // userId -> { permissions: Set, version, expiry }
  #rolesCache = null;
  #rolesCacheExpiry = 0;

  constructor({ database }) {
    this.#database = database;
  }

  get version() {
    return this.#version;
  }

  /** Run idempotent migrations for RBAC tables */
  async initialize() {
    const pool = this.#database?.pool;
    if (!pool) return;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        resource TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(resource, action)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_roles (
        role_id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id TEXT,
        label TEXT NOT NULL,
        description TEXT DEFAULT '',
        permissions_json JSONB NOT NULL DEFAULT '[]',
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON custom_roles(org_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_custom_roles_label ON custom_roles(label)
    `);

    // Add custom_role_id to users if not present
    try {
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_role_id TEXT REFERENCES custom_roles(role_id)
      `);
    } catch {
      // Column may already exist or table structure differs
    }

    // Seed system permissions
    for (const perm of SYSTEM_PERMISSIONS) {
      await pool.query(
        `INSERT INTO permissions (resource, action) VALUES ($1, $2) ON CONFLICT (resource, action) DO NOTHING`,
        [perm.resource, perm.action]
      );
    }

    // Seed system roles (org_id = NULL for system-wide)
    for (const role of SYSTEM_ROLES) {
      const existing = await pool.query(
        `SELECT role_id FROM custom_roles WHERE label = $1 AND is_system = TRUE AND org_id IS NULL LIMIT 1`,
        [role.label]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO custom_roles (label, org_id, permissions_json, is_system)
           VALUES ($1, NULL, $2, TRUE)`,
          [role.label, JSON.stringify(role.permissions)]
        );
      } else {
        // Update permissions for existing system roles to keep them current
        await pool.query(
          `UPDATE custom_roles SET permissions_json = $1, updated_at = NOW()
           WHERE role_id = $2`,
          [JSON.stringify(role.permissions), existing.rows[0].role_id]
        );
      }
    }

    mapleLog("info", "rbac.initialized", { permissionCount: SYSTEM_PERMISSIONS.length, roleCount: SYSTEM_ROLES.length });
  }

  /** List all defined permissions */
  async listPermissions() {
    const pool = this.#database?.pool;
    if (!pool) return SYSTEM_PERMISSIONS;

    try {
      const result = await pool.query(
        `SELECT permission_id, resource, action, description FROM permissions ORDER BY resource, action`
      );
      return result.rows.map((row) => ({
        permissionId: row.permission_id,
        resource: row.resource,
        action: row.action,
        description: row.description,
      }));
    } catch {
      return SYSTEM_PERMISSIONS;
    }
  }

  /** List roles, optionally scoped to an org */
  async listRoles(orgId = null) {
    const now = Date.now();
    if (this.#rolesCache && now < this.#rolesCacheExpiry) {
      const cached = this.#rolesCache;
      if (orgId) return cached.filter((r) => !r.orgId || r.orgId === orgId);
      return cached;
    }

    const pool = this.#database?.pool;
    if (!pool) return [];

    const result = await pool.query(
      `SELECT role_id, org_id, label, description, permissions_json, is_system, created_at, updated_at
       FROM custom_roles
       ORDER BY is_system DESC, label ASC`
    );

    const roles = result.rows.map((row) => ({
      roleId: row.role_id,
      orgId: row.org_id,
      label: row.label,
      description: row.description ?? "",
      permissions: safeParseJson(row.permissions_json, []),
      isSystem: row.is_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    this.#rolesCache = roles;
    this.#rolesCacheExpiry = now + CACHE_TTL_MS;

    if (orgId) return roles.filter((r) => !r.orgId || r.orgId === orgId);
    return roles;
  }

  /** Get a single role by ID */
  async getRole(roleId) {
    const pool = this.#database?.pool;
    if (!pool) return null;

    const result = await pool.query(
      `SELECT role_id, org_id, label, description, permissions_json, is_system, created_at, updated_at
       FROM custom_roles WHERE role_id = $1`,
      [roleId]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      roleId: row.role_id,
      orgId: row.org_id,
      label: row.label,
      description: row.description ?? "",
      permissions: safeParseJson(row.permissions_json, []),
      isSystem: row.is_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Create a custom role */
  async createCustomRole({ orgId, label, description, permissions }) {
    const pool = this.#database?.pool;
    if (!pool) throw new Error("Database unavailable");

    // Validate permissions
    const validPerms = (permissions ?? []).filter((p) => ALL_PERMISSION_KEYS.has(p));

    const roleId = randomUUID();
    await pool.query(
      `INSERT INTO custom_roles (role_id, org_id, label, description, permissions_json, is_system)
       VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [roleId, orgId ?? null, label, description ?? "", JSON.stringify(validPerms)]
    );

    this.#invalidateCache();
    return { roleId, orgId, label, description: description ?? "", permissions: validPerms, isSystem: false };
  }

  /** Update a custom role (system roles cannot be modified) */
  async updateCustomRole(roleId, { label, description, permissions }) {
    const pool = this.#database?.pool;
    if (!pool) throw new Error("Database unavailable");

    const existing = await this.getRole(roleId);
    if (!existing) return null;
    if (existing.isSystem) throw new Error("Cannot modify system roles");

    const updates = [];
    const values = [];
    let idx = 1;

    if (label !== undefined) {
      updates.push(`label = $${idx++}`);
      values.push(label);
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description);
    }
    if (permissions !== undefined) {
      const validPerms = permissions.filter((p) => ALL_PERMISSION_KEYS.has(p));
      updates.push(`permissions_json = $${idx++}`);
      values.push(JSON.stringify(validPerms));
    }

    if (updates.length === 0) return existing;

    updates.push(`updated_at = NOW()`);
    values.push(roleId);

    await pool.query(
      `UPDATE custom_roles SET ${updates.join(", ")} WHERE role_id = $${idx}`,
      values
    );

    this.#invalidateCache();
    return this.getRole(roleId);
  }

  /** Delete a custom role (system roles cannot be deleted) */
  async deleteCustomRole(roleId) {
    const pool = this.#database?.pool;
    if (!pool) return false;

    const existing = await this.getRole(roleId);
    if (!existing) return false;
    if (existing.isSystem) throw new Error("Cannot delete system roles");

    // Unassign users from this role
    try {
      await pool.query(
        `UPDATE users SET custom_role_id = NULL WHERE custom_role_id = $1`,
        [roleId]
      );
    } catch {
      // users table may not have the column yet
    }

    await pool.query(`DELETE FROM custom_roles WHERE role_id = $1`, [roleId]);
    this.#invalidateCache();
    return true;
  }

  /** Assign a user to a custom role */
  async assignUserRole(userId, roleId) {
    const pool = this.#database?.pool;
    if (!pool) throw new Error("Database unavailable");

    const role = await this.getRole(roleId);
    if (!role) throw new Error("Role not found");

    await pool.query(
      `UPDATE users SET custom_role_id = $1 WHERE id = $2`,
      [roleId, userId]
    );

    this.#invalidateCache(userId);
    return { userId, roleId, roleLabel: role.label };
  }

  /** Resolve effective permissions for a user */
  async resolveEffectivePermissions(userId, orgId = null) {
    const cacheKey = `${userId}:${orgId ?? "global"}`;
    const now = Date.now();
    const cached = this.#cache.get(cacheKey);
    if (cached && now < cached.expiry && cached.version === this.#version) {
      return cached.permissions;
    }

    const pool = this.#database?.pool;
    if (!pool) return new Set();

    try {
      // Get user's custom role
      const userResult = await pool.query(
        `SELECT custom_role_id, role FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) return new Set();

      const user = userResult.rows[0];
      let permissions = new Set();

      if (user.custom_role_id) {
        // Use explicit custom role
        const role = await this.getRole(user.custom_role_id);
        if (role) {
          for (const p of role.permissions) permissions.add(p);
        }
      } else if (user.role) {
        // Fall back to legacy role column → map to system role
        const systemLabel = LEGACY_ROLE_MAP[user.role] ?? "member";
        const roles = await this.listRoles();
        const systemRole = roles.find(
          (r) => r.isSystem && r.label === systemLabel && !r.orgId
        );
        if (systemRole) {
          for (const p of systemRole.permissions) permissions.add(p);
        }
      }

      // Also merge org-scoped role if orgId provided
      if (orgId) {
        const orgRoles = await this.listRoles(orgId);
        // Check if user has an org-specific role assignment
        // For now, org roles are additive to user's base role
        try {
          const memberResult = await pool.query(
            `SELECT role_id FROM gateway_modifier_org_members WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
            [orgId, userId]
          );
          if (memberResult.rows.length > 0 && memberResult.rows[0].role_id) {
            const orgRole = orgRoles.find((r) => r.roleId === memberResult.rows[0].role_id);
            if (orgRole) {
              for (const p of orgRole.permissions) permissions.add(p);
            }
          }
        } catch {
          // org_members table may not exist or have role_id column
        }
      }

      this.#cache.set(cacheKey, {
        permissions,
        version: this.#version,
        expiry: now + CACHE_TTL_MS,
      });

      return permissions;
    } catch (err) {
      mapleLog("warn", "rbac.resolve_permissions_failed", { userId, error: err.message });
      return new Set();
    }
  }

  /** Check if a user has a specific permission */
  async hasPermission(userId, resource, action, orgId = null) {
    const permissions = await this.resolveEffectivePermissions(userId, orgId);
    return permissions.has(`${resource}:${action}`);
  }

  /** Get the user's effective role label */
  async getUserRoleLabel(userId) {
    const pool = this.#database?.pool;
    if (!pool) return "member";

    try {
      const result = await pool.query(
        `SELECT u.custom_role_id, u.role, cr.label as custom_label
         FROM users u
         LEFT JOIN custom_roles cr ON u.custom_role_id = cr.role_id
         WHERE u.id = $1`,
        [userId]
      );
      if (result.rows.length === 0) return "member";
      const row = result.rows[0];
      return row.custom_label ?? LEGACY_ROLE_MAP[row.role] ?? "member";
    } catch {
      return "member";
    }
  }

  /** Force invalidation of cache */
  #invalidateCache(userId = null) {
    this.#version++;
    this.#rolesCache = null;
    this.#rolesCacheExpiry = 0;
    if (userId) {
      for (const [key] of this.#cache) {
        if (key.startsWith(`${userId}:`)) this.#cache.delete(key);
      }
    } else {
      this.#cache.clear();
    }
  }

  /** Force refresh for a specific version mismatch */
  forceRefreshIfStale(clientVersion) {
    if (typeof clientVersion === "number" && clientVersion < this.#version) {
      return true; // caller should re-resolve
    }
    return false;
  }
}

function safeParseJson(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  // JSONB from PostgreSQL may already be parsed — ensure it's an array
  if (value && typeof value === "object" && Array.isArray(value)) return value;
  return fallback;
}

export { SYSTEM_PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSION_KEYS, LEGACY_ROLE_MAP };
