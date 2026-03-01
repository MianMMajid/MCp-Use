/**
 * Validates that a value is a safe HTTP(S) URL using the URL constructor
 * instead of regex for more robust parsing.
 */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
