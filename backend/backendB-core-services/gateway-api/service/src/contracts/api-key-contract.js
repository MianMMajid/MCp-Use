export function validateApiKeyCreate(body) {
  const errors = [];
  const name = String(body?.name ?? "").trim();
  if (!name) errors.push("name is required");
  if (name.length > 100) errors.push("name must be 100 characters or less");
  const scopes = Array.isArray(body?.scopes) ? body.scopes.map(s => String(s).trim()).filter(Boolean) : [];
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) errors.push("expiresAt must be a valid ISO date");
  return { valid: errors.length === 0, errors, sanitized: { name, scopes, expiresAt: expiresAt?.toISOString() ?? null } };
}

export function validateServiceAccountCreate(body) {
  const errors = [];
  const name = String(body?.name ?? "").trim();
  if (!name) errors.push("name is required");
  if (name.length > 100) errors.push("name must be 100 characters or less");
  const description = String(body?.description ?? "").trim();
  return { valid: errors.length === 0, errors, sanitized: { name, description } };
}
