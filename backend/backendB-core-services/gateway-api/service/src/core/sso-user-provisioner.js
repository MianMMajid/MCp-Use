/**
 * sso-user-provisioner.js
 *
 * Just-In-Time (JIT) user provisioning from SSO claims.
 * Handles linking existing users to SSO identities, creating new users
 * on first login, assigning org membership, and attribute mapping
 * across SAML 2.0 and OIDC protocols.
 */
import { randomUUID } from "node:crypto";

// ── SAML Attribute Name Constants ────────────────────────────────────────────

const SAML_ATTR_NAMES = {
  email: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "urn:oid:0.9.2342.19200300.100.1.3",
    "email",
    "mail",
    "Email",
  ],
  firstName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "urn:oid:2.5.4.42",
    "firstName",
    "givenName",
    "given_name",
    "first_name",
    "FirstName",
  ],
  lastName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    "urn:oid:2.5.4.4",
    "lastName",
    "surname",
    "sn",
    "family_name",
    "last_name",
    "LastName",
  ],
  groups: [
    "http://schemas.xmlsoap.org/claims/Group",
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
    "memberOf",
    "groups",
    "group",
    "Groups",
  ],
  displayName: [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    "urn:oid:2.16.840.1.113730.3.1.241",
    "displayName",
    "name",
    "cn",
  ],
};

// ── Attribute Mapping ────────────────────────────────────────────────────────

/**
 * Find the first matching attribute value from a list of possible names.
 *
 * @param {Record<string, string|string[]>} attributes - SSO attributes
 * @param {string[]} possibleNames - Ordered list of attribute names to try
 * @returns {string|string[]|undefined}
 */
function findAttribute(attributes, possibleNames) {
  if (!attributes || typeof attributes !== "object") return undefined;
  for (const name of possibleNames) {
    if (name in attributes) {
      return attributes[name];
    }
  }
  return undefined;
}

/**
 * Coerce a value to a string (taking the first element if it's an array).
 */
function toScalar(value) {
  if (Array.isArray(value)) return value[0] || "";
  return String(value ?? "");
}

/**
 * Coerce a value to a string array.
 */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return String(value).split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Map raw SSO attributes to Maple user fields.
 *
 * @param {Record<string, string|string[]>} attributes - Raw SSO attributes
 * @param {"saml" | "oidc"} protocol - SSO protocol for attribute mapping
 * @returns {{ email: string, firstName: string, lastName: string, groups: string[], displayName: string }}
 */
export function mapSsoAttributes(attributes, protocol) {
  if (!attributes || typeof attributes !== "object") {
    return { email: "", firstName: "", lastName: "", groups: [], displayName: "" };
  }

  if (protocol === "oidc") {
    // OIDC uses standard claim names directly
    return {
      email: toScalar(attributes.email),
      firstName: toScalar(attributes.given_name || attributes.firstName),
      lastName: toScalar(attributes.family_name || attributes.lastName),
      groups: toArray(attributes.groups),
      displayName: toScalar(attributes.name || attributes.preferred_username || ""),
    };
  }

  // SAML — resolve from well-known attribute URIs
  return {
    email: toScalar(findAttribute(attributes, SAML_ATTR_NAMES.email)),
    firstName: toScalar(findAttribute(attributes, SAML_ATTR_NAMES.firstName)),
    lastName: toScalar(findAttribute(attributes, SAML_ATTR_NAMES.lastName)),
    groups: toArray(findAttribute(attributes, SAML_ATTR_NAMES.groups)),
    displayName: toScalar(findAttribute(attributes, SAML_ATTR_NAMES.displayName)),
  };
}

// ── JIT Provisioning ─────────────────────────────────────────────────────────

/**
 * Provision or link a user based on SSO claims.
 *
 * 1. Check if a user with the given email already exists
 * 2. If exists, link the SSO identity (update SSO metadata)
 * 3. If not exists and autoProvision is true, create a new user
 * 4. Assign to the org with the default role
 * 5. Return the user and provisioning status
 *
 * @param {{
 *   email: string,
 *   nameId: string,
 *   attributes: Record<string, string|string[]>,
 *   orgId: string,
 *   defaultRoleId: string,
 *   autoProvision: boolean,
 *   database: { pool: { query: Function } },
 * }} params
 * @returns {Promise<{ user: object, isNewUser: boolean, linked: boolean }>}
 */
export async function provisionOrLinkUser({
  email,
  nameId,
  attributes,
  orgId,
  defaultRoleId,
  autoProvision,
  database,
}) {
  if (!email) throw new Error("Email is required for SSO user provisioning.");
  if (!database?.pool) throw new Error("Database is required for SSO user provisioning.");

  const normalizedEmail = email.toLowerCase().trim();

  // Step 1: Check for existing user
  let existingUser = null;
  try {
    const result = await database.pool.query(
      `SELECT id, username, email, role, sso_name_id, sso_provider_id
       FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [normalizedEmail],
    );
    if (result.rows.length > 0) {
      existingUser = result.rows[0];
    }
  } catch {
    // users table may have different schema; try findUserByEmail if available
    if (typeof database.findUserByEmail === "function") {
      existingUser = await database.findUserByEmail(normalizedEmail);
    }
  }

  if (existingUser) {
    // Step 2: Link — update SSO metadata on existing user
    try {
      await database.pool.query(
        `UPDATE users SET
          sso_name_id = $1,
          sso_linked_at = $2,
          sso_last_login = $2
        WHERE id = $3`,
        [nameId, new Date().toISOString(), existingUser.id],
      );
    } catch {
      // sso columns may not exist yet; non-fatal
    }

    // Ensure org membership
    await ensureOrgMembership(database, existingUser.id, orgId, defaultRoleId);

    return {
      user: { ...existingUser, sso_name_id: nameId },
      isNewUser: false,
      linked: true,
    };
  }

  // Step 3: Auto-provision new user
  if (!autoProvision) {
    throw new Error(
      `No user found with email '${normalizedEmail}' and auto-provisioning is disabled. ` +
      `Contact your administrator to create an account.`
    );
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const mapped = mapSsoAttributes(attributes, nameId ? "saml" : "oidc");
  const username = mapped.email || normalizedEmail;
  const displayName = mapped.displayName ||
    [mapped.firstName, mapped.lastName].filter(Boolean).join(" ") ||
    username;

  try {
    await database.pool.query(
      `INSERT INTO users (id, username, email, display_name, role, sso_name_id, sso_linked_at, sso_last_login, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $7)`,
      [userId, username, normalizedEmail, displayName, defaultRoleId || "member", nameId, now],
    );
  } catch (err) {
    // Handle race condition: user may have been created between check and insert
    if (String(err.code) === "23505" || String(err.message).includes("duplicate")) {
      // Retry the lookup and link
      return provisionOrLinkUser({
        email, nameId, attributes, orgId, defaultRoleId,
        autoProvision: false,
        database,
      });
    }
    throw err;
  }

  const newUser = {
    id: userId,
    username,
    email: normalizedEmail,
    display_name: displayName,
    role: defaultRoleId || "member",
    sso_name_id: nameId,
  };

  // Step 4: Assign to org
  await ensureOrgMembership(database, userId, orgId, defaultRoleId);

  return {
    user: newUser,
    isNewUser: true,
    linked: true,
  };
}

// ── Org Membership ───────────────────────────────────────────────────────────

/**
 * Ensure the user has membership in the specified org.
 * Creates the membership row if it does not exist.
 */
async function ensureOrgMembership(database, userId, orgId, roleId) {
  if (!orgId || !database?.pool) return;

  // Assign RBAC custom_role_id on the user if a roleId is provided
  if (roleId) {
    try {
      await database.pool.query(
        `UPDATE users SET custom_role_id = (
          SELECT role_id FROM custom_roles WHERE label = $1 AND (org_id IS NULL OR org_id = $2) LIMIT 1
        ) WHERE id = $3 AND custom_role_id IS NULL`,
        [roleId, orgId, userId],
      );
    } catch {
      // custom_roles table may not exist yet; non-fatal
    }
  }

  // Try to add org membership via business_org_members (the actual table in this codebase)
  try {
    await database.pool.query(
      `INSERT INTO business_org_members (id, org_id, user_id, role_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $5)
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      [randomUUID(), orgId, userId, roleId || "member", new Date().toISOString()],
    );
  } catch {
    // business_org_members table may not exist; non-fatal for SSO flow
  }
}
