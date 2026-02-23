/**
 * Safe-Redirect Link Wrapping
 *
 * Rewrites external URLs in text to pass through the /api/redirect endpoint
 * for security validation before the user follows them.
 */

/**
 * Rewrite external URLs in text to /api/redirect?url=<encoded>.
 * Preserves same-origin URLs (matching baseUrl host).
 */
export function wrapExternalLinks(text: string, baseUrl: string): string {
  let baseHost: string;
  try {
    baseHost = new URL(baseUrl).host;
  } catch {
    return text;
  }

  return text.replace(
    /https?:\/\/[^\s)>\]"']+/gi,
    (match) => {
      try {
        const parsed = new URL(match);
        if (parsed.host === baseHost) return match;
        return `${baseUrl}/api/redirect?url=${encodeURIComponent(match)}`;
      } catch {
        return match;
      }
    },
  );
}
