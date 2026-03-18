export function validateOrgCreate(body) {
  const errors = [];
  const name = String(body?.name ?? "").trim();
  if (!name) errors.push("name is required");
  if (name.length > 100) errors.push("name must be 100 characters or less");
  const slug = String(body?.slug ?? "").trim();
  if (slug && !/^[a-z0-9-]+$/.test(slug)) errors.push("slug must be lowercase alphanumeric with dashes");
  return { valid: errors.length === 0, errors, sanitized: { name, slug: slug || undefined } };
}

export function validateOrgUpdate(body) {
  const errors = [];
  const name = body?.name !== undefined ? String(body.name).trim() : undefined;
  if (name !== undefined && !name) errors.push("name cannot be empty");
  if (name && name.length > 100) errors.push("name must be 100 characters or less");
  return { valid: errors.length === 0, errors, sanitized: { name } };
}
