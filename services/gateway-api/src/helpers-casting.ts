export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function envValue(value: unknown): string | undefined {
  const normalized = asString(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
      const unwrapped = normalized.slice(1, -1).trim();
      return unwrapped.length > 0 ? unwrapped : undefined;
    }
  }
  return normalized;
}

export function parseAppIdList(value: unknown): string[] {
  const rawEntries: string[] = [];
  if (typeof value === "string") {
    rawEntries.push(...value.split(","));
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") {
        rawEntries.push(entry);
      }
    }
  }

  const unique = new Set<string>();
  for (const entry of rawEntries) {
    const normalized = entry.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      continue;
    }
    const normalizedKey = key.trim();
    const normalizedValue = raw.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    record[normalizedKey] = normalizedValue;
  }
  return record;
}

export function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const normalized = key(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(item);
  }
  return out;
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = asNumber(value);
  return Number.isFinite(parsed) ? Number(parsed) : fallback;
}
