export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export function jsonRpcErrorPayload(
  id: unknown,
  code: number,
  message: string,
  data?: Record<string, unknown>,
) {
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

export function unauthorizedBody(reason: string) {
  return {
    error: "Unauthorized",
    reason,
    hint: "Provide x-api-key / Authorization bearer token or sign in via /landing.",
  };
}
