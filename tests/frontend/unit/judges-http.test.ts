import { describe, expect, it, vi } from "vitest";
import { jsonResponse, runBrowserScript } from "../setup/script-loader";

const AUTH_SCRIPT = "frontend/frontendA-it-console/public/judges-auth.js";
const HTTP_SCRIPT = "frontend/frontendA-it-console/public/judges-http.js";
const STORAGE_KEY = "maple_judge_api_key";

interface MapleAuthModule {
  persistApiKey: (rawKey: unknown) => string;
}

interface MapleHttpModule {
  fetchJson: (path: string) => Promise<unknown>;
  postJson: (path: string, body?: unknown) => Promise<unknown>;
}

declare global {
  interface Window {
    MapleAuth?: MapleAuthModule;
    MapleHttp?: MapleHttpModule;
  }
}

async function loadMapleHttp(): Promise<MapleHttpModule> {
  await runBrowserScript(AUTH_SCRIPT);
  await runBrowserScript(HTTP_SCRIPT);
  if (!window.MapleHttp) {
    throw new Error("MapleHttp did not initialize.");
  }
  return window.MapleHttp;
}

describe("judges-http.js", () => {
  it("fetchJson sends credentials and API key header", async () => {
    localStorage.setItem(STORAGE_KEY, "api-key-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    await expect(http.fetchJson("/api/test")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
    expect(options.headers).toMatchObject({ "x-api-key": "api-key-1" });
  });

  it("fetchJson omits API key header when no auth key is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    await expect(http.fetchJson("/api/no-key")).resolves.toEqual({ ok: true });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toEqual({});
  });

  it("fetchJson surfaces reason on non-2xx responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ reason: "invalid_token" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    await expect(http.fetchJson("/api/secure")).rejects.toThrow("HTTP 401 (invalid_token)");
  });

  it("fetchJson surfaces status when reason is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: false }, 500)));

    const http = await loadMapleHttp();
    await expect(http.fetchJson("/api/fail")).rejects.toThrow("HTTP 500");
  });

  it("fetchJson returns empty object when success payload is not valid JSON", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<<not-json>>", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const http = await loadMapleHttp();
    await expect(http.fetchJson("/api/non-json")).resolves.toEqual({});
    expect(warnSpy).toHaveBeenCalled();
  });

  it("postJson sends JSON payload, credentials, and API key header", async () => {
    localStorage.setItem(STORAGE_KEY, "api-key-2");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, created: true }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    await expect(http.postJson("/api/create", { traceId: "t-1" })).resolves.toEqual({
      ok: true,
      created: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.body).toBe(JSON.stringify({ traceId: "t-1" }));
    expect(options.headers).toMatchObject({
      "content-type": "application/json",
      "x-api-key": "api-key-2",
    });
  });

  it("postJson defaults to an empty object body when payload is undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    await expect(http.postJson("/api/default-body")).resolves.toEqual({ ok: true });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBe("{}");
  });

  it("postJson surfaces payload error string for non-2xx responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "blocked_by_policy" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    await expect(http.postJson("/api/action", { action: "block" })).rejects.toThrow(
      "HTTP 403 (blocked_by_policy)"
    );
  });

  it("postJson falls back to reason field for non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ reason: "invalid_signature" }, 401))
    );

    const http = await loadMapleHttp();
    await expect(http.postJson("/api/action", { action: "approve" })).rejects.toThrow(
      "HTTP 401 (invalid_signature)"
    );
  });

  it("postJson surfaces generic HTTP error when payload has no reason/error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: false }, 500)));

    const http = await loadMapleHttp();
    await expect(http.postJson("/api/unknown-error", { action: "noop" })).rejects.toThrow(
      "HTTP 500"
    );
  });

  it("retries GET requests after transient network failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(jsonResponse({ data: [1, 2, 3] }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    const request = http.fetchJson("/api/retry");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(request).resolves.toEqual({ data: [1, 2, 3] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails after exhausting GET retries", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    const request = http.fetchJson("/api/retry-fail");
    const assertion = expect(request).rejects.toThrow("network down");
    await vi.advanceTimersByTimeAsync(4_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries POST once on a transient network failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("temporary timeout"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    const request = http.postJson("/api/retry-post", { ok: true });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(request).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails after exhausting POST retry budget", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("post failed"));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    const request = http.postJson("/api/retry-post-fail", { ok: true });
    const assertion = expect(request).rejects.toThrow("post failed");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries GET after request timeouts (AbortError)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, options?: RequestInit) => {
        const signal = options?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      })
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const http = await loadMapleHttp();
    const request = http.fetchJson("/api/timeout-retry");
    const assertion = expect(request).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
