/**
 * error-envelope.js
 *
 * M4-07: Normalized error envelope for all API responses. Provides a
 * consistent { ok, error: { code, message, hint? } } shape across every
 * gateway endpoint.
 */

export function buildApiError(code, message, hint) {
  return {
    ok: false,
    error: {
      code: String(code ?? "UNKNOWN_ERROR"),
      message: String(message ?? "Unknown error."),
      ...(hint ? { hint: String(hint) } : {}),
    },
  };
}

export function apiErrorEnvelope(c, statusCode, code, message, hint) {
  return c.json(buildApiError(code, message, hint), statusCode);
}
