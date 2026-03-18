const PLAN_TIERS = new Set(["free", "pro", "team", "enterprise"]);

export function validateEntitlementCheck(body) {
  const errors = [];
  const orgId = String(body?.orgId ?? "").trim();
  if (!orgId) errors.push("orgId is required");
  const feature = String(body?.feature ?? "").trim();
  if (!feature) errors.push("feature is required");
  return { valid: errors.length === 0, errors, sanitized: { orgId, feature } };
}

export function validateUsageIncrement(body) {
  const errors = [];
  const orgId = String(body?.orgId ?? "").trim();
  if (!orgId) errors.push("orgId is required");
  const metric = String(body?.metric ?? "").trim();
  if (!metric) errors.push("metric is required");
  const count = Number(body?.count ?? 1);
  if (!Number.isFinite(count) || count < 1) errors.push("count must be a positive integer");
  return { valid: errors.length === 0, errors, sanitized: { orgId, metric, count: Math.floor(count) } };
}

export { PLAN_TIERS };
