const VALID_ROLES = new Set(["owner", "admin", "member", "viewer", "billing"]);

export function validateMemberInvite(body) {
  const errors = [];
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) errors.push("email is required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email is not valid");
  const role = String(body?.role ?? "member").trim().toLowerCase();
  if (!VALID_ROLES.has(role)) errors.push(`role must be one of: ${[...VALID_ROLES].join(", ")}`);
  return { valid: errors.length === 0, errors, sanitized: { email, role } };
}

export function validateRoleUpdate(body) {
  const errors = [];
  const role = String(body?.role ?? "").trim().toLowerCase();
  if (!role) errors.push("role is required");
  if (!VALID_ROLES.has(role)) errors.push(`role must be one of: ${[...VALID_ROLES].join(", ")}`);
  return { valid: errors.length === 0, errors, sanitized: { role } };
}

export { VALID_ROLES };
