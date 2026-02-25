export function apiErrorPayload(code, message, details) {
    return {
        ok: false,
        code: String(code ?? "UNKNOWN_ERROR"),
        error: String(message ?? "Unknown error."),
        ...(details === undefined ? {} : { details }),
    };
}

export function apiErrorResponse(c, statusCode, code, message, details) {
    return c.json(apiErrorPayload(code, message, details), statusCode);
}
