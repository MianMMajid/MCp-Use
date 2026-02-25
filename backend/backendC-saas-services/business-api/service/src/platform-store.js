import { createHash, randomUUID } from "node:crypto";

const DEFAULT_LIMITS = {
  maxRunsPerDay: 100,
  maxToolCallsPerDay: 500,
  maxConcurrentLongform: 2,
};

const DEFAULT_ROLES = [
  { roleId: "owner", label: "Owner", permissions: ["*"] },
  { roleId: "admin", label: "Admin", permissions: ["members:write", "keys:write"] },
  { roleId: "member", label: "Member", permissions: ["tools:read"] },
];

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeOrg(record) {
  if (!record) {
    return null;
  }
  return {
    orgId: String(record.org_id),
    name: String(record.name),
    ownerUserId: String(record.owner_user_id),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
    membersCount: Number(record.members_count ?? 0),
  };
}

function parseJson(rawValue, fallback) {
  try {
    return JSON.parse(String(rawValue ?? ""));
  } catch {
    return fallback;
  }
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function keyHash(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function keyToken(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function toDateKey(timestamp) {
  return String(timestamp ?? "").slice(0, 10);
}

export class PlatformStore {
  constructor(options = {}) {
    this.database = options.database;
    this.initialized = false;
    this.memory = {
      orgs: new Map(),
      invites: new Map(),
      userApiKeys: new Map(),
      serviceAccounts: new Map(),
      limitOverrides: new Map(),
    };
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    if (hasPool(this.database)) {
      await this.database.pool.query(`
        CREATE TABLE IF NOT EXISTS business_orgs (
          org_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          owner_user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS business_org_members (
          org_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          joined_at TEXT NOT NULL,
          PRIMARY KEY (org_id, user_id),
          FOREIGN KEY (org_id) REFERENCES business_orgs(org_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_business_org_members_user
          ON business_org_members(user_id);

        CREATE TABLE IF NOT EXISTS business_org_roles (
          org_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          label TEXT NOT NULL,
          permissions_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (org_id, role_id),
          FOREIGN KEY (org_id) REFERENCES business_orgs(org_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS business_org_invites (
          invite_id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          issued_by TEXT NOT NULL,
          role_id TEXT NOT NULL,
          email TEXT,
          created_at TEXT NOT NULL,
          accepted_at TEXT,
          accepted_by TEXT,
          FOREIGN KEY (org_id) REFERENCES business_orgs(org_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_business_org_invites_org
          ON business_org_invites(org_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS business_user_api_keys (
          key_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          key_preview TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_business_user_api_keys_user
          ON business_user_api_keys(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS business_service_accounts (
          account_id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (org_id) REFERENCES business_orgs(org_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_business_service_accounts_org
          ON business_service_accounts(org_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS business_service_account_keys (
          key_id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          key_preview TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          FOREIGN KEY (account_id) REFERENCES business_service_accounts(account_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_business_service_account_keys_account
          ON business_service_account_keys(account_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS business_limit_overrides (
          user_id TEXT PRIMARY KEY,
          overrides_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    }
    this.initialized = true;
  }

  async listOrganizationsForUser(userId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return [];
    }
    if (!hasPool(this.database)) {
      return [...this.memory.orgs.values()]
        .filter((org) => org.members.some((member) => member.userId === normalizedUserId))
        .map((org) => ({
          orgId: org.orgId,
          name: org.name,
          ownerUserId: org.ownerUserId,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
          membersCount: org.members.length,
        }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    const result = await this.database.pool.query(
      `
        SELECT
          o.org_id,
          o.name,
          o.owner_user_id,
          o.created_at,
          o.updated_at,
          COALESCE(member_counts.members_count, 0) AS members_count
        FROM business_orgs o
        INNER JOIN business_org_members mine
          ON mine.org_id = o.org_id AND mine.user_id = $1
        LEFT JOIN (
          SELECT org_id, COUNT(*)::int AS members_count
          FROM business_org_members
          GROUP BY org_id
        ) member_counts ON member_counts.org_id = o.org_id
        ORDER BY o.updated_at DESC
      `,
      [normalizedUserId]
    );
    return result.rows.map((row) => normalizeOrg(row)).filter(Boolean);
  }

  async createOrganization(input) {
    await this.ensureInitialized();
    const ownerUserId = String(input.ownerUserId ?? "").trim();
    if (!ownerUserId) {
      throw new Error("ownerUserId is required.");
    }
    const name = String(input.name ?? "").trim() || "New Organization";
    const orgId = randomUUID();
    const timestamp = nowIso();

    if (!hasPool(this.database)) {
      this.memory.orgs.set(orgId, {
        orgId,
        name,
        ownerUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
        members: [{ userId: ownerUserId, roleId: "owner", joinedAt: timestamp }],
        roles: DEFAULT_ROLES.map((role) => ({ ...role })),
      });
      return {
        orgId,
        name,
        ownerUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
        membersCount: 1,
      };
    }

    await this.database.pool.query("BEGIN");
    try {
      await this.database.pool.query(
        `
          INSERT INTO business_orgs (org_id, name, owner_user_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
        `,
        [orgId, name, ownerUserId, timestamp]
      );
      await this.database.pool.query(
        `
          INSERT INTO business_org_members (org_id, user_id, role_id, joined_at)
          VALUES ($1, $2, $3, $4)
        `,
        [orgId, ownerUserId, "owner", timestamp]
      );
      for (const role of DEFAULT_ROLES) {
        await this.database.pool.query(
          `
            INSERT INTO business_org_roles (
              org_id, role_id, label, permissions_json, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $5)
            ON CONFLICT (org_id, role_id) DO NOTHING
          `,
          [orgId, role.roleId, role.label, JSON.stringify(role.permissions), timestamp]
        );
      }
      await this.database.pool.query("COMMIT");
    } catch (error) {
      await this.database.pool.query("ROLLBACK");
      throw error;
    }
    return {
      orgId,
      name,
      ownerUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      membersCount: 1,
    };
  }

  async getOrganizationForUser(orgId, userId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedOrgId || !normalizedUserId) {
      return null;
    }

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      if (!org) {
        return null;
      }
      if (!org.members.some((member) => member.userId === normalizedUserId)) {
        return null;
      }
      return {
        orgId: org.orgId,
        name: org.name,
        ownerUserId: org.ownerUserId,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        membersCount: org.members.length,
      };
    }

    const result = await this.database.pool.query(
      `
        SELECT
          o.org_id,
          o.name,
          o.owner_user_id,
          o.created_at,
          o.updated_at,
          COALESCE(member_counts.members_count, 0) AS members_count
        FROM business_orgs o
        INNER JOIN business_org_members mine
          ON mine.org_id = o.org_id AND mine.user_id = $2
        LEFT JOIN (
          SELECT org_id, COUNT(*)::int AS members_count
          FROM business_org_members
          GROUP BY org_id
        ) member_counts ON member_counts.org_id = o.org_id
        WHERE o.org_id = $1
        LIMIT 1
      `,
      [normalizedOrgId, normalizedUserId]
    );
    return normalizeOrg(result.rows[0]);
  }

  async updateOrganizationName(orgId, name) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedName = String(name ?? "").trim();
    if (!normalizedOrgId || !normalizedName) {
      return null;
    }
    const timestamp = nowIso();

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      if (!org) {
        return null;
      }
      org.name = normalizedName;
      org.updatedAt = timestamp;
      return {
        orgId: org.orgId,
        name: org.name,
        ownerUserId: org.ownerUserId,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        membersCount: org.members.length,
      };
    }

    const result = await this.database.pool.query(
      `
        UPDATE business_orgs
        SET name = $2, updated_at = $3
        WHERE org_id = $1
        RETURNING org_id, name, owner_user_id, created_at, updated_at
      `,
      [normalizedOrgId, normalizedName, timestamp]
    );
    if (!result.rows[0]) {
      return null;
    }
    return this.getOrganizationById(normalizedOrgId);
  }

  async getOrganizationById(orgId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    if (!normalizedOrgId) {
      return null;
    }

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      if (!org) {
        return null;
      }
      return {
        orgId: org.orgId,
        name: org.name,
        ownerUserId: org.ownerUserId,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        membersCount: org.members.length,
      };
    }

    const result = await this.database.pool.query(
      `
        SELECT
          o.org_id,
          o.name,
          o.owner_user_id,
          o.created_at,
          o.updated_at,
          COALESCE(member_counts.members_count, 0) AS members_count
        FROM business_orgs o
        LEFT JOIN (
          SELECT org_id, COUNT(*)::int AS members_count
          FROM business_org_members
          GROUP BY org_id
        ) member_counts ON member_counts.org_id = o.org_id
        WHERE o.org_id = $1
        LIMIT 1
      `,
      [normalizedOrgId]
    );
    return normalizeOrg(result.rows[0]);
  }

  async listOrganizationMembers(orgId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    if (!normalizedOrgId) {
      return [];
    }

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      return org ? [...org.members] : [];
    }

    const result = await this.database.pool.query(
      `
        SELECT user_id, role_id, joined_at
        FROM business_org_members
        WHERE org_id = $1
        ORDER BY joined_at ASC
      `,
      [normalizedOrgId]
    );
    return result.rows.map((row) => ({
      userId: String(row.user_id),
      roleId: String(row.role_id),
      joinedAt: String(row.joined_at),
    }));
  }

  async listOrganizationRoles(orgId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    if (!normalizedOrgId) {
      return [];
    }

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      return org ? [...org.roles] : [];
    }

    const result = await this.database.pool.query(
      `
        SELECT role_id, label, permissions_json
        FROM business_org_roles
        WHERE org_id = $1
        ORDER BY role_id ASC
      `,
      [normalizedOrgId]
    );
    return result.rows.map((row) => ({
      roleId: String(row.role_id),
      label: String(row.label),
      permissions: normalizePermissions(parseJson(row.permissions_json, [])),
    }));
  }

  async assignOrganizationRole(orgId, userId, roleId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedRoleId = String(roleId ?? "").trim() || "member";
    if (!normalizedOrgId || !normalizedUserId) {
      return null;
    }
    const timestamp = nowIso();

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      if (!org) {
        return null;
      }
      const existing = org.members.find((member) => member.userId === normalizedUserId);
      if (existing) {
        existing.roleId = normalizedRoleId;
      } else {
        org.members.push({
          userId: normalizedUserId,
          roleId: normalizedRoleId,
          joinedAt: timestamp,
        });
      }
      org.updatedAt = timestamp;
      return { userId: normalizedUserId, roleId: normalizedRoleId };
    }

    await this.database.pool.query(
      `
        INSERT INTO business_org_members (org_id, user_id, role_id, joined_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
      `,
      [normalizedOrgId, normalizedUserId, normalizedRoleId, timestamp]
    );
    await this.database.pool.query(
      `UPDATE business_orgs SET updated_at = $2 WHERE org_id = $1`,
      [normalizedOrgId, timestamp]
    );
    return { userId: normalizedUserId, roleId: normalizedRoleId };
  }

  async removeOrganizationMember(orgId, userId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedOrgId || !normalizedUserId) {
      return false;
    }
    const timestamp = nowIso();

    if (!hasPool(this.database)) {
      const org = this.memory.orgs.get(normalizedOrgId);
      if (!org) {
        return false;
      }
      const before = org.members.length;
      org.members = org.members.filter((member) => member.userId !== normalizedUserId);
      org.updatedAt = timestamp;
      return before !== org.members.length;
    }

    const result = await this.database.pool.query(
      `DELETE FROM business_org_members WHERE org_id = $1 AND user_id = $2`,
      [normalizedOrgId, normalizedUserId]
    );
    await this.database.pool.query(
      `UPDATE business_orgs SET updated_at = $2 WHERE org_id = $1`,
      [normalizedOrgId, timestamp]
    );
    return Number(result.rowCount ?? 0) > 0;
  }

  async createOrganizationInvite(input) {
    await this.ensureInitialized();
    const orgId = String(input.orgId ?? "").trim();
    const issuedBy = String(input.issuedBy ?? "").trim();
    const roleId = String(input.roleId ?? "").trim() || "member";
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!orgId || !issuedBy) {
      throw new Error("orgId and issuedBy are required.");
    }
    const inviteId = randomUUID();
    const createdAt = nowIso();
    const invite = {
      inviteId,
      orgId,
      issuedBy,
      roleId,
      email,
      createdAt,
      acceptedAt: "",
      acceptedBy: "",
    };

    if (!hasPool(this.database)) {
      this.memory.invites.set(inviteId, invite);
      return invite;
    }

    await this.database.pool.query(
      `
        INSERT INTO business_org_invites (
          invite_id, org_id, issued_by, role_id, email, created_at, accepted_at, accepted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)
      `,
      [inviteId, orgId, issuedBy, roleId, email || null, createdAt]
    );
    return invite;
  }

  async getOrganizationInvite(inviteId) {
    await this.ensureInitialized();
    const normalizedInviteId = String(inviteId ?? "").trim();
    if (!normalizedInviteId) {
      return null;
    }

    if (!hasPool(this.database)) {
      return this.memory.invites.get(normalizedInviteId) ?? null;
    }

    const result = await this.database.pool.query(
      `
        SELECT invite_id, org_id, issued_by, role_id, email, created_at, accepted_at, accepted_by
        FROM business_org_invites
        WHERE invite_id = $1
        LIMIT 1
      `,
      [normalizedInviteId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      inviteId: String(row.invite_id),
      orgId: String(row.org_id),
      issuedBy: String(row.issued_by),
      roleId: String(row.role_id),
      email: String(row.email ?? ""),
      createdAt: String(row.created_at),
      acceptedAt: String(row.accepted_at ?? ""),
      acceptedBy: String(row.accepted_by ?? ""),
    };
  }

  async acceptOrganizationInvite(inviteId, userId) {
    await this.ensureInitialized();
    const normalizedInviteId = String(inviteId ?? "").trim();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedInviteId || !normalizedUserId) {
      return null;
    }

    const invite = await this.getOrganizationInvite(normalizedInviteId);
    if (!invite) {
      return null;
    }
    if (invite.acceptedAt) {
      return invite;
    }
    const acceptedAt = nowIso();

    if (!hasPool(this.database)) {
      invite.acceptedAt = acceptedAt;
      invite.acceptedBy = normalizedUserId;
      this.memory.invites.set(invite.inviteId, invite);
      const org = this.memory.orgs.get(invite.orgId);
      if (org && !org.members.some((member) => member.userId === normalizedUserId)) {
        org.members.push({
          userId: normalizedUserId,
          roleId: invite.roleId || "member",
          joinedAt: acceptedAt,
        });
        org.updatedAt = acceptedAt;
      }
      return invite;
    }

    await this.database.pool.query(
      `
        INSERT INTO business_org_members (org_id, user_id, role_id, joined_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
      `,
      [invite.orgId, normalizedUserId, invite.roleId || "member", acceptedAt]
    );
    await this.database.pool.query(
      `
        UPDATE business_org_invites
        SET accepted_at = $2, accepted_by = $3
        WHERE invite_id = $1
      `,
      [invite.inviteId, acceptedAt, normalizedUserId]
    );
    await this.database.pool.query(
      `UPDATE business_orgs SET updated_at = $2 WHERE org_id = $1`,
      [invite.orgId, acceptedAt]
    );
    return this.getOrganizationInvite(invite.inviteId);
  }

  async listUserApiKeys(userId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return [];
    }

    if (!hasPool(this.database)) {
      const entries = this.memory.userApiKeys.get(normalizedUserId) ?? [];
      return entries.map((entry) => ({
        keyId: entry.keyId,
        name: entry.name,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        fingerprint: entry.keyPreview,
      }));
    }

    const result = await this.database.pool.query(
      `
        SELECT key_id, name, key_preview, created_at, expires_at
        FROM business_user_api_keys
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [normalizedUserId]
    );
    return result.rows.map((row) => ({
      keyId: String(row.key_id),
      name: String(row.name),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at ?? ""),
      fingerprint: String(row.key_preview),
    }));
  }

  async createUserApiKey(userId, input = {}) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      throw new Error("userId is required.");
    }
    const name = String(input.name ?? "").trim() || "api-key";
    const expiresAt = String(input.expiresAt ?? "").trim();
    const token = keyToken("maple_user");
    const keyId = randomUUID();
    const createdAt = nowIso();
    const preview = token.slice(-12);
    const hash = keyHash(token);

    if (!hasPool(this.database)) {
      const existing = this.memory.userApiKeys.get(normalizedUserId) ?? [];
      existing.push({
        keyId,
        name,
        createdAt,
        expiresAt,
        keyPreview: preview,
        keyHash: hash,
      });
      this.memory.userApiKeys.set(normalizedUserId, existing);
      return {
        keyId,
        name,
        createdAt,
        expiresAt,
        fingerprint: preview,
        token,
      };
    }

    await this.database.pool.query(
      `
        INSERT INTO business_user_api_keys (
          key_id, user_id, name, key_hash, key_preview, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [keyId, normalizedUserId, name, hash, preview, createdAt, expiresAt || null]
    );
    return {
      keyId,
      name,
      createdAt,
      expiresAt,
      fingerprint: preview,
      token,
    };
  }

  async deleteUserApiKey(userId, keyId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedKeyId = String(keyId ?? "").trim();
    if (!normalizedUserId || !normalizedKeyId) {
      return false;
    }

    if (!hasPool(this.database)) {
      const existing = this.memory.userApiKeys.get(normalizedUserId) ?? [];
      const next = existing.filter((entry) => entry.keyId !== normalizedKeyId);
      this.memory.userApiKeys.set(normalizedUserId, next);
      return existing.length !== next.length;
    }

    const result = await this.database.pool.query(
      `DELETE FROM business_user_api_keys WHERE user_id = $1 AND key_id = $2`,
      [normalizedUserId, normalizedKeyId]
    );
    return Number(result.rowCount ?? 0) > 0;
  }

  async listServiceAccounts(orgId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    if (!normalizedOrgId) {
      return [];
    }

    if (!hasPool(this.database)) {
      return this.memory.serviceAccounts.get(normalizedOrgId) ?? [];
    }

    const accountsResult = await this.database.pool.query(
      `
        SELECT account_id, org_id, name, created_at
        FROM business_service_accounts
        WHERE org_id = $1
        ORDER BY created_at DESC
      `,
      [normalizedOrgId]
    );
    const accountIds = accountsResult.rows.map((row) => String(row.account_id));
    if (accountIds.length === 0) {
      return [];
    }
    const keysResult = await this.database.pool.query(
      `
        SELECT key_id, account_id, key_preview, created_at, expires_at
        FROM business_service_account_keys
        WHERE account_id = ANY($1::text[])
        ORDER BY created_at DESC
      `,
      [accountIds]
    );
    const keysByAccount = new Map();
    for (const row of keysResult.rows) {
      const accountId = String(row.account_id);
      const existing = keysByAccount.get(accountId) ?? [];
      existing.push({
        keyId: String(row.key_id),
        fingerprint: String(row.key_preview),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at ?? ""),
      });
      keysByAccount.set(accountId, existing);
    }
    return accountsResult.rows.map((row) => ({
      id: String(row.account_id),
      orgId: String(row.org_id),
      name: String(row.name),
      createdAt: String(row.created_at),
      keys: keysByAccount.get(String(row.account_id)) ?? [],
    }));
  }

  async createServiceAccount(orgId, name) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedName = String(name ?? "").trim() || "service-account";
    if (!normalizedOrgId) {
      throw new Error("orgId is required.");
    }
    const accountId = randomUUID();
    const createdAt = nowIso();

    if (!hasPool(this.database)) {
      const list = this.memory.serviceAccounts.get(normalizedOrgId) ?? [];
      const account = {
        id: accountId,
        orgId: normalizedOrgId,
        name: normalizedName,
        createdAt,
        keys: [],
      };
      list.push(account);
      this.memory.serviceAccounts.set(normalizedOrgId, list);
      return account;
    }

    await this.database.pool.query(
      `
        INSERT INTO business_service_accounts (account_id, org_id, name, created_at)
        VALUES ($1, $2, $3, $4)
      `,
      [accountId, normalizedOrgId, normalizedName, createdAt]
    );
    return {
      id: accountId,
      orgId: normalizedOrgId,
      name: normalizedName,
      createdAt,
      keys: [],
    };
  }

  async createServiceAccountKey(orgId, accountId, input = {}) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedAccountId = String(accountId ?? "").trim();
    if (!normalizedOrgId || !normalizedAccountId) {
      throw new Error("orgId and accountId are required.");
    }
    const token = keyToken("maple_sa");
    const keyId = randomUUID();
    const createdAt = nowIso();
    const expiresAt = String(input.expiresAt ?? "").trim();
    const preview = token.slice(-12);
    const hash = keyHash(token);

    if (!hasPool(this.database)) {
      const list = this.memory.serviceAccounts.get(normalizedOrgId) ?? [];
      const account = list.find((entry) => entry.id === normalizedAccountId);
      if (!account) {
        return null;
      }
      account.keys.push({
        keyId,
        fingerprint: preview,
        createdAt,
        expiresAt,
      });
      return {
        keyId,
        fingerprint: preview,
        createdAt,
        expiresAt,
        token,
      };
    }

    const accountResult = await this.database.pool.query(
      `
        SELECT account_id
        FROM business_service_accounts
        WHERE account_id = $1 AND org_id = $2
        LIMIT 1
      `,
      [normalizedAccountId, normalizedOrgId]
    );
    if (!accountResult.rows[0]) {
      return null;
    }
    await this.database.pool.query(
      `
        INSERT INTO business_service_account_keys (
          key_id, account_id, key_hash, key_preview, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [keyId, normalizedAccountId, hash, preview, createdAt, expiresAt || null]
    );
    return {
      keyId,
      fingerprint: preview,
      createdAt,
      expiresAt,
      token,
    };
  }

  async deleteServiceAccountKey(orgId, accountId, keyId) {
    await this.ensureInitialized();
    const normalizedOrgId = String(orgId ?? "").trim();
    const normalizedAccountId = String(accountId ?? "").trim();
    const normalizedKeyId = String(keyId ?? "").trim();
    if (!normalizedOrgId || !normalizedAccountId || !normalizedKeyId) {
      return false;
    }

    if (!hasPool(this.database)) {
      const list = this.memory.serviceAccounts.get(normalizedOrgId) ?? [];
      const account = list.find((entry) => entry.id === normalizedAccountId);
      if (!account) {
        return false;
      }
      const before = account.keys.length;
      account.keys = account.keys.filter((entry) => entry.keyId !== normalizedKeyId);
      return before !== account.keys.length;
    }

    const accountResult = await this.database.pool.query(
      `
        SELECT account_id
        FROM business_service_accounts
        WHERE account_id = $1 AND org_id = $2
        LIMIT 1
      `,
      [normalizedAccountId, normalizedOrgId]
    );
    if (!accountResult.rows[0]) {
      return false;
    }
    const result = await this.database.pool.query(
      `
        DELETE FROM business_service_account_keys
        WHERE account_id = $1 AND key_id = $2
      `,
      [normalizedAccountId, normalizedKeyId]
    );
    return Number(result.rowCount ?? 0) > 0;
  }

  async getEntitlementsForUser(userId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    const subscription = await this.database.ensureFreeSubscription(normalizedUserId);
    const plan = subscription?.plan || "free";
    if (plan === "enterprise") {
      return {
        plan,
        entitlements: [
          "agent:turn",
          "agent:longform",
          "org:rbac",
          "usage:timeseries",
          "tools:governance",
          "audit:export",
        ],
      };
    }
    if (plan === "team") {
      return {
        plan,
        entitlements: ["agent:turn", "agent:longform", "org:members", "usage:timeseries"],
      };
    }
    return {
      plan,
      entitlements: ["agent:turn", "usage:summary"],
    };
  }

  async getUsageSummary(userId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    if (!hasPool(this.database)) {
      return {
        window: "30d",
        runs: 0,
        toolExecutions: 0,
        modelTokens: 0,
      };
    }

    const sessionsResult = await this.database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM sessions
        WHERE user_id = $1 AND created_at >= $2
      `,
      [normalizedUserId, windowStart]
    );
    const auditResult = await this.database.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM audit_events
        WHERE user_id = $1
          AND timestamp >= $2
          AND event_type IN (
            'AUDIT_EVENT_TYPE_POLICY_EVALUATED',
            'AUDIT_EVENT_TYPE_POLICY_DENIED'
          )
      `,
      [normalizedUserId, windowStart]
    );

    return {
      window: "30d",
      runs: Number(sessionsResult.rows[0]?.count ?? 0),
      toolExecutions: Number(auditResult.rows[0]?.count ?? 0),
      modelTokens: 0,
    };
  }

  async getUsageTimeseries(userId, days) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedDays = Math.max(1, Math.min(Number(days) || 14, 365));
    const startTime = Date.now() - (normalizedDays - 1) * 24 * 60 * 60 * 1000;
    const points = [];
    for (let i = 0; i < normalizedDays; i += 1) {
      const ts = new Date(startTime + i * 24 * 60 * 60 * 1000).toISOString();
      points.push({
        ts,
        runs: 0,
        toolExecutions: 0,
        modelTokens: 0,
      });
    }

    if (!hasPool(this.database)) {
      return points;
    }

    const startIso = points[0].ts;
    const sessionsResult = await this.database.pool.query(
      `
        SELECT SUBSTRING(created_at, 1, 10) AS day, COUNT(*)::int AS count
        FROM sessions
        WHERE user_id = $1 AND created_at >= $2
        GROUP BY day
      `,
      [normalizedUserId, startIso]
    );
    const toolExecResult = await this.database.pool.query(
      `
        SELECT SUBSTRING(timestamp, 1, 10) AS day, COUNT(*)::int AS count
        FROM audit_events
        WHERE user_id = $1
          AND timestamp >= $2
          AND event_type IN (
            'AUDIT_EVENT_TYPE_POLICY_EVALUATED',
            'AUDIT_EVENT_TYPE_POLICY_DENIED'
          )
        GROUP BY day
      `,
      [normalizedUserId, startIso]
    );

    const runsByDay = new Map(
      sessionsResult.rows.map((row) => [String(row.day), Number(row.count ?? 0)])
    );
    const toolExecByDay = new Map(
      toolExecResult.rows.map((row) => [String(row.day), Number(row.count ?? 0)])
    );

    for (const point of points) {
      const day = toDateKey(point.ts);
      point.runs = runsByDay.get(day) ?? 0;
      point.toolExecutions = toolExecByDay.get(day) ?? 0;
    }
    return points;
  }

  async getLimitsForUser(userId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();

    if (!hasPool(this.database)) {
      const override = this.memory.limitOverrides.get(normalizedUserId) ?? {};
      return { ...DEFAULT_LIMITS, ...override };
    }

    const result = await this.database.pool.query(
      `SELECT overrides_json FROM business_limit_overrides WHERE user_id = $1 LIMIT 1`,
      [normalizedUserId]
    );
    const override = parseJson(result.rows[0]?.overrides_json, {});
    return { ...DEFAULT_LIMITS, ...(override && typeof override === "object" ? override : {}) };
  }

  async updateLimitsForUser(userId, patch) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    const next = {
      ...(await this.getLimitsForUser(normalizedUserId)),
      ...Object.fromEntries(
        Object.entries(patch ?? {}).filter(([, value]) => value !== undefined)
      ),
    };
    const updatedAt = nowIso();

    if (!hasPool(this.database)) {
      this.memory.limitOverrides.set(normalizedUserId, next);
      return next;
    }

    await this.database.pool.query(
      `
        INSERT INTO business_limit_overrides (user_id, overrides_json, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          overrides_json = EXCLUDED.overrides_json,
          updated_at = EXCLUDED.updated_at
      `,
      [normalizedUserId, JSON.stringify(next), updatedAt]
    );
    return next;
  }
}

export { DEFAULT_LIMITS, DEFAULT_ROLES };
