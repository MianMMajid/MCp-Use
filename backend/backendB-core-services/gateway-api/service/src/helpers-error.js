export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error ?? "Unknown error");
}
export function jsonRpcErrorPayload(id, code, message, data) {
    return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
            code,
            message,
            ...(data ? { data } : {}),
        },
    };
}
export function unauthorizedBody(reason) {
    return {
        error: "Unauthorized",
        reason,
        hint: "Provide x-api-key / Authorization bearer token or sign in via /login.",
    };
}
//# sourceMappingURL=helpers-error.js.map
