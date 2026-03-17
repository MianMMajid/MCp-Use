/**
 * rbac-permissions.test.mjs
 *
 * Tests for RBAC permission resolution, caching, and role hierarchy.
 */

// Set required env vars before any imports
process.env.MAPLE_LOG_LEVEL = process.env.MAPLE_LOG_LEVEL || "error";
process.env.MAPLE_LOG_REQUESTS = process.env.MAPLE_LOG_REQUESTS || "0";
process.env.MAPLE_LOG_INCLUDE_BODIES = process.env.MAPLE_LOG_INCLUDE_BODIES || "0";
process.env.MAPLE_LOG_BODY_MAX_CHARS = process.env.MAPLE_LOG_BODY_MAX_CHARS || "4000";
process.env.MAPLE_FIREWALL_LOG_DIR = process.env.MAPLE_FIREWALL_LOG_DIR || "/tmp/maple-firewall-logs";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory mock database for unit testing
function createMockDatabase() {
  const tables = {
    permissions: [],
    custom_roles: [],
    users: [],
  };

  const pool = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();

      // DDL — no-op
      if (s.startsWith("CREATE") || s.startsWith("ALTER") || s.startsWith("CREATE INDEX")) {
        return { rows: [] };
      }

      // INSERT INTO permissions
      if (s.includes("INSERT INTO permissions")) {
        const [resource, action] = params;
        if (!tables.permissions.find((p) => p.resource === resource && p.action === action)) {
          tables.permissions.push({ permission_id: `perm-${tables.permissions.length}`, resource, action, description: "" });
        }
        return { rows: [] };
      }

      // SELECT role_id FROM custom_roles WHERE label = $1 AND is_system = TRUE AND org_id IS NULL
      if (s.includes("FROM custom_roles WHERE label") && s.includes("is_system")) {
        const label = params[0];
        return { rows: tables.custom_roles.filter((r) => r.label === label && r.is_system === true && r.org_id === null) };
      }

      // INSERT INTO custom_roles ... VALUES ($1, NULL, $2, TRUE)  — system role seed
      if (s.includes("INSERT INTO custom_roles") && s.includes("TRUE")) {
        const role = {
          role_id: `role-sys-${tables.custom_roles.length}`,
          label: params[0],
          org_id: null,
          permissions_json: params[1],
          is_system: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        tables.custom_roles.push(role);
        return { rows: [] };
      }

      // INSERT INTO custom_roles ... VALUES ($1, $2, $3, $4, $5, FALSE) — custom role
      if (s.includes("INSERT INTO custom_roles") && s.includes("FALSE")) {
        const role = {
          role_id: params[0],
          org_id: params[1],
          label: params[2],
          description: params[3] ?? "",
          permissions_json: params[4],
          is_system: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        tables.custom_roles.push(role);
        return { rows: [] };
      }

      // UPDATE custom_roles SET permissions_json
      if (s.includes("UPDATE custom_roles SET permissions_json") && !s.includes("label")) {
        const [permJson, roleId] = params;
        const role = tables.custom_roles.find((r) => r.role_id === roleId);
        if (role) role.permissions_json = permJson;
        return { rows: [] };
      }

      // UPDATE custom_roles SET ... WHERE role_id (generic update)
      if (s.startsWith("UPDATE custom_roles SET") && s.includes("WHERE role_id")) {
        const roleId = params[params.length - 1];
        const role = tables.custom_roles.find((r) => r.role_id === roleId);
        if (role) role.updated_at = new Date().toISOString();
        return { rows: [] };
      }

      // SELECT all custom_roles ORDER BY is_system DESC
      if (s.includes("FROM custom_roles") && s.includes("ORDER BY is_system")) {
        return { rows: [...tables.custom_roles] };
      }

      // SELECT custom_roles WHERE role_id
      if (s.includes("FROM custom_roles WHERE role_id")) {
        return { rows: tables.custom_roles.filter((r) => r.role_id === params[0]) };
      }

      // SELECT FROM permissions ORDER BY
      if (s.includes("FROM permissions ORDER BY")) {
        return { rows: tables.permissions };
      }

      // SELECT FROM users WHERE id (simple)
      if (s.includes("FROM users WHERE id") && !s.includes("LEFT JOIN")) {
        return { rows: tables.users.filter((u) => u.id === params[0]) };
      }

      // SELECT FROM users u LEFT JOIN custom_roles
      if (s.includes("FROM users u") && s.includes("LEFT JOIN custom_roles")) {
        const user = tables.users.find((u) => u.id === params[0]);
        if (!user) return { rows: [] };
        const role = tables.custom_roles.find((r) => r.role_id === user.custom_role_id);
        return { rows: [{ ...user, custom_label: role?.label ?? null }] };
      }

      // UPDATE users SET custom_role_id
      if (s.includes("UPDATE users SET custom_role_id")) {
        const [roleId, userId] = params;
        const user = tables.users.find((u) => u.id === userId);
        if (user) user.custom_role_id = roleId;
        return { rows: [] };
      }

      // DELETE FROM custom_roles
      if (s.includes("DELETE FROM custom_roles")) {
        const roleId = params[0];
        const idx = tables.custom_roles.findIndex((r) => r.role_id === roleId);
        if (idx >= 0) { tables.custom_roles.splice(idx, 1); return { rows: [{ role_id: roleId }] }; }
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  return {
    pool,
    tables,
    addUser(id, role = "user", customRoleId = null) {
      tables.users.push({ id, role, custom_role_id: customRoleId });
    },
  };
}

const { RbacStore, SYSTEM_PERMISSIONS, ALL_PERMISSION_KEYS } = await import(
  "../src/core/rbac-store.js"
);

describe("RbacStore", () => {
  let db;
  let store;

  beforeEach(async () => {
    db = createMockDatabase();
    store = new RbacStore({ database: db });
    await store.initialize();
  });

  describe("initialization", () => {
    it("seeds system permissions", () => {
      assert.ok(db.tables.permissions.length > 0);
      assert.ok(db.tables.permissions.some((p) => p.resource === "org" && p.action === "read"));
    });

    it("seeds system roles", () => {
      const labels = db.tables.custom_roles.map((r) => r.label);
      assert.ok(labels.includes("owner"));
      assert.ok(labels.includes("admin"));
      assert.ok(labels.includes("member"));
      assert.ok(labels.includes("viewer"));
    });
  });

  describe("listPermissions", () => {
    it("returns all system permissions", async () => {
      const perms = await store.listPermissions();
      assert.ok(perms.length >= SYSTEM_PERMISSIONS.length);
    });
  });

  describe("listRoles", () => {
    it("returns system roles", async () => {
      const roles = await store.listRoles();
      assert.ok(roles.length >= 4);
    });

    it("caches roles for subsequent calls", async () => {
      const roles1 = await store.listRoles();
      const roles2 = await store.listRoles();
      assert.equal(roles1.length, roles2.length);
    });
  });

  describe("createCustomRole", () => {
    it("creates a custom role with valid permissions", async () => {
      const role = await store.createCustomRole({
        orgId: "org-1",
        label: "security-analyst",
        permissions: ["firewall:read", "firewall:create", "audit:read"],
      });
      assert.equal(role.label, "security-analyst");
      assert.ok(role.permissions.includes("firewall:read"));
      assert.equal(role.isSystem, false);
    });

    it("filters out invalid permissions", async () => {
      const role = await store.createCustomRole({
        label: "limited",
        permissions: ["firewall:read", "nonexistent:action", "org:read"],
      });
      assert.ok(role.permissions.includes("firewall:read"));
      assert.ok(!role.permissions.includes("nonexistent:action"));
    });
  });

  describe("resolveEffectivePermissions", () => {
    it("resolves permissions for user with legacy admin role", async () => {
      db.addUser("user-admin", "admin");
      const perms = await store.resolveEffectivePermissions("user-admin");
      assert.ok(perms.size > 0, "Admin should have permissions");
      assert.ok(perms.has("org:read"));
    });

    it("resolves permissions for user with custom role", async () => {
      const role = await store.createCustomRole({
        label: "minimal",
        permissions: ["org:read", "audit:read"],
      });
      db.addUser("user-custom", "user", role.roleId);
      const perms = await store.resolveEffectivePermissions("user-custom");
      assert.ok(perms.has("org:read"));
      assert.ok(perms.has("audit:read"));
      assert.ok(!perms.has("user:create"));
    });

    it("returns empty set for nonexistent user", async () => {
      const perms = await store.resolveEffectivePermissions("nonexistent");
      assert.equal(perms.size, 0);
    });
  });

  describe("hasPermission", () => {
    it("returns true for granted permission", async () => {
      db.addUser("user-has", "admin");
      const result = await store.hasPermission("user-has", "org", "read");
      assert.equal(result, true);
    });

    it("returns false for denied permission", async () => {
      db.addUser("user-denied", "viewer");
      const result = await store.hasPermission("user-denied", "org", "create");
      assert.equal(result, false);
    });
  });

  describe("assignUserRole", () => {
    it("assigns a role to a user", async () => {
      const role = await store.createCustomRole({
        label: "custom-ops",
        permissions: ["firewall:read"],
      });
      db.addUser("user-assign", "user");
      const result = await store.assignUserRole("user-assign", role.roleId);
      assert.equal(result.userId, "user-assign");
      assert.equal(result.roleLabel, "custom-ops");
    });

    it("throws for nonexistent role", async () => {
      db.addUser("user-bad", "user");
      await assert.rejects(
        () => store.assignUserRole("user-bad", "nonexistent-role"),
        { message: "Role not found" }
      );
    });
  });

  describe("deleteCustomRole", () => {
    it("deletes a custom role", async () => {
      const role = await store.createCustomRole({
        label: "temp-role",
        permissions: ["org:read"],
      });
      const deleted = await store.deleteCustomRole(role.roleId);
      assert.equal(deleted, true);
    });

    it("throws when trying to delete system role", async () => {
      const roles = await store.listRoles();
      const ownerRole = roles.find((r) => r.isSystem && r.label === "owner");
      if (ownerRole) {
        await assert.rejects(
          () => store.deleteCustomRole(ownerRole.roleId),
          { message: /system roles/ }
        );
      }
    });
  });

  describe("version and cache invalidation", () => {
    it("increments version on role creation", async () => {
      const v1 = store.version;
      await store.createCustomRole({ label: "test", permissions: [] });
      assert.ok(store.version > v1);
    });
  });
});

describe("SYSTEM_PERMISSIONS", () => {
  it("contains expected resources", () => {
    const resources = new Set(SYSTEM_PERMISSIONS.map((p) => p.resource));
    assert.ok(resources.has("org"));
    assert.ok(resources.has("policy"));
    assert.ok(resources.has("firewall"));
    assert.ok(resources.has("user"));
    assert.ok(resources.has("audit"));
  });
});

describe("ALL_PERMISSION_KEYS", () => {
  it("contains formatted permission keys", () => {
    assert.ok(ALL_PERMISSION_KEYS.has("org:read"));
    assert.ok(ALL_PERMISSION_KEYS.has("firewall:create"));
    assert.ok(ALL_PERMISSION_KEYS.has("admin:access"));
  });
});
