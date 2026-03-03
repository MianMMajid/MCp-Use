import { waitFor } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { flushPromises, jsonResponse, runBrowserScript } from "../setup/script-loader";

const LANDING_SCRIPT = "frontend/frontendC-marketing-download-site/public/landing.js";

function renderLandingDom(): void {
  document.body.innerHTML = `
    <main>
      <button type="button" class="nav-hamburger" aria-expanded="false">Menu</button>
      <div class="nav-links"></div>
      <div class="auth-tabs">
        <button id="tabSignIn" type="button" class="auth-tab active">Sign In</button>
        <button id="tabSignUp" type="button" class="auth-tab">Create Account</button>
      </div>

      <section id="signinPane">
        <form id="signinForm">
          <input id="username" name="username" type="text" />
          <input id="password" name="password" type="password" />
          <button type="submit">Open Dashboard</button>
          <p id="signinError"></p>
          <a id="forgotPasswordLink" href="#">Forgot password?</a>
        </form>
        <div id="googleSection" class="hidden">
          <div id="googleSignInContainer"></div>
        </div>
      </section>

      <section id="signupPane" class="hidden">
        <form id="signupForm">
          <input id="signupUsername" name="username" type="text" />
          <input id="signupEmail" name="email" type="email" />
          <input id="signupPassword" name="password" type="password" />
          <button type="submit">Create Account</button>
          <p id="signupError"></p>
        </form>
      </section>

      <section id="forgotPasswordPane" class="hidden">
        <form id="forgotPasswordForm">
          <input id="forgotEmail" type="email" />
          <button type="submit">Send Reset Link</button>
          <p id="forgotPasswordError"></p>
          <a id="forgotBackLink" href="#">Back</a>
        </form>
      </section>
    </main>
  `;
}

type RouteHandler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

function installFetchRoutes(routes: Record<string, RouteHandler>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl, window.location.origin);
    const method = String(init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname}`;
    const handler = routes[key] ?? routes[url.pathname];
    if (!handler) {
      return jsonResponse({ error: `No handler for ${key}` }, 500);
    }
    return handler(url, init);
  });

  vi.stubGlobal("fetch", mock as typeof fetch);
  return mock;
}

function submitForm(formId: string): void {
  const form = document.getElementById(formId) as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("landing.js", () => {
  it("returns early and warns when required sign-in form elements are missing", async () => {
    document.body.innerHTML = `<main><p>empty</p></main>`;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await runBrowserScript(LANDING_SCRIPT);

    expect(warnSpy).toHaveBeenCalledWith("[landing] Required form elements not found in DOM");
  });

  it("toggles mobile navigation state via hamburger button", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    const navHamburger = document.querySelector(".nav-hamburger") as HTMLButtonElement;
    const navLinks = document.querySelector(".nav-links") as HTMLElement;
    navHamburger.click();
    expect(navLinks.classList.contains("open")).toBe(true);
    expect(navHamburger.getAttribute("aria-expanded")).toBe("true");
  });

  it("restores saved username and focuses password field", async () => {
    renderLandingDom();
    localStorage.setItem("maple_judge_username", "saved_user");
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
    });

    await runBrowserScript(LANDING_SCRIPT);

    expect((document.getElementById("username") as HTMLInputElement).value).toBe("saved_user");
    expect(document.activeElement).toBe(document.getElementById("password"));
  });

  it("requires username on sign-in", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    const password = document.getElementById("password") as HTMLInputElement;
    password.value = "secret";

    submitForm("signinForm");
    await flushPromises();

    expect(document.getElementById("signinError")).toHaveTextContent("Enter your username.");
  });

  it("requires password on sign-in", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    const username = document.getElementById("username") as HTMLInputElement;
    username.value = "admin";

    submitForm("signinForm");
    await flushPromises();

    expect(document.getElementById("signinError")).toHaveTextContent("Enter your password.");
  });

  it("ignores sign-in submits while a request is already in progress", async () => {
    renderLandingDom();
    const fetchMock = installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/login": () => jsonResponse({ ok: true }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    const username = document.getElementById("username") as HTMLInputElement;
    const password = document.getElementById("password") as HTMLInputElement;
    const submit = document.querySelector("#signinForm button[type=submit]") as HTMLButtonElement;
    username.value = "operator";
    password.value = "secret";
    submit.disabled = true;

    submitForm("signinForm");
    await flushPromises(3);

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/auth/login"))).toBe(false);
  });

  it("submits login, sanitizes saved username, and redirects to safe next route", async () => {
    renderLandingDom();
    window.history.pushState({}, "", "/landing?next=/judge");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const setItemSpy = vi.spyOn(localStorage, "setItem");
    const fetchMock = installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/login": () => jsonResponse({ ok: true }),
    });

    await runBrowserScript(LANDING_SCRIPT);

    const username = document.getElementById("username") as HTMLInputElement;
    const password = document.getElementById("password") as HTMLInputElement;
    username.value = `bad<user>"'&`;
    password.value = "super-secret";

    submitForm("signinForm");
    await flushPromises(5);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(setItemSpy).toHaveBeenCalledWith("maple_judge_username", "baduser");
    });
  });

  it("rejects unsafe next redirects and falls back to /judge", async () => {
    renderLandingDom();
    window.history.pushState({}, "", "/landing?next=//evil.example");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const setItemSpy = vi.spyOn(localStorage, "setItem");
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/login": () => jsonResponse({ ok: true }),
    });

    await runBrowserScript(LANDING_SCRIPT);

    const username = document.getElementById("username") as HTMLInputElement;
    const password = document.getElementById("password") as HTMLInputElement;
    username.value = "operator";
    password.value = "secret";

    submitForm("signinForm");
    await flushPromises(5);

    await waitFor(() => {
      expect(setItemSpy).toHaveBeenCalledWith("maple_judge_username", "operator");
    });
  });

  it("shows a readable error when login response is not JSON", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/login": () =>
        new Response("bad gateway", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    const username = document.getElementById("username") as HTMLInputElement;
    const password = document.getElementById("password") as HTMLInputElement;
    const submitButton = document.querySelector<HTMLButtonElement>("#signinForm button[type=submit]");
    username.value = "operator";
    password.value = "secret";

    submitForm("signinForm");
    await flushPromises(5);

    expect(document.getElementById("signinError")).toHaveTextContent("Unexpected response (502)");
    expect(submitButton).not.toBeNull();
    expect(submitButton?.disabled).toBe(false);
    expect(submitButton).toHaveTextContent("Open Dashboard");
  });

  it("shows timeout message when sign-in request aborts", async () => {
    vi.useFakeTimers();
    renderLandingDom();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const rawUrl =
          typeof _input === "string"
            ? _input
            : _input instanceof URL
              ? _input.toString()
              : _input.url;
        const url = new URL(rawUrl, window.location.origin);
        if (url.pathname === "/api/auth/google/client-id") {
          return Promise.resolve(jsonResponse({ clientId: "" }, 200));
        }
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      })
    );
    await runBrowserScript(LANDING_SCRIPT);

    (document.getElementById("username") as HTMLInputElement).value = "operator";
    (document.getElementById("password") as HTMLInputElement).value = "secret";
    submitForm("signinForm");
    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises(5);

    expect(document.getElementById("signinError")).toHaveTextContent("Request timed out.");
  });

  it("validates signup username format before POST", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/register": () => jsonResponse({ ok: true }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    (document.getElementById("tabSignUp") as HTMLButtonElement).click();
    expect(document.getElementById("signupPane")?.classList.contains("hidden")).toBe(false);

    const username = document.getElementById("signupUsername") as HTMLInputElement;
    const password = document.getElementById("signupPassword") as HTMLInputElement;
    username.value = "bad username";
    password.value = "12345678";

    submitForm("signupForm");
    await flushPromises();

    expect(document.getElementById("signupError")).toHaveTextContent(
      "Username may only contain letters, numbers, underscores, dots, and hyphens."
    );
  });

  it("ignores signup submits while account creation is in progress", async () => {
    renderLandingDom();
    const fetchMock = installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/register": () => jsonResponse({ ok: true }),
    });
    await runBrowserScript(LANDING_SCRIPT);
    (document.getElementById("tabSignUp") as HTMLButtonElement).click();

    (document.getElementById("signupUsername") as HTMLInputElement).value = "valid_user";
    (document.getElementById("signupPassword") as HTMLInputElement).value = "12345678";
    const submit = document.querySelector("#signupForm button[type=submit]") as HTMLButtonElement;
    submit.disabled = true;

    submitForm("signupForm");
    await flushPromises(3);

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/auth/register"))).toBe(false);
  });

  it("validates signup email format before POST", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/register": () => jsonResponse({ ok: true }),
    });
    await runBrowserScript(LANDING_SCRIPT);
    (document.getElementById("tabSignUp") as HTMLButtonElement).click();

    (document.getElementById("signupUsername") as HTMLInputElement).value = "valid_user";
    (document.getElementById("signupEmail") as HTMLInputElement).value = "invalid-email";
    (document.getElementById("signupPassword") as HTMLInputElement).value = "12345678";

    submitForm("signupForm");
    await flushPromises();

    expect(document.getElementById("signupError")).toHaveTextContent("Enter a valid email address.");
  });

  it("requires signup password to be at least eight characters", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/register": () => jsonResponse({ ok: true }),
    });
    await runBrowserScript(LANDING_SCRIPT);
    (document.getElementById("tabSignUp") as HTMLButtonElement).click();

    (document.getElementById("signupUsername") as HTMLInputElement).value = "valid_user";
    (document.getElementById("signupPassword") as HTMLInputElement).value = "short";

    submitForm("signupForm");
    await flushPromises();

    expect(document.getElementById("signupError")).toHaveTextContent(
      "Password must be at least 8 characters."
    );
  });

  it("maps 409 registration responses to username taken message", async () => {
    renderLandingDom();
    const fetchMock = installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/register": () => jsonResponse({ error: "duplicate" }, 409),
    });
    await runBrowserScript(LANDING_SCRIPT);
    (document.getElementById("tabSignUp") as HTMLButtonElement).click();

    (document.getElementById("signupUsername") as HTMLInputElement).value = "valid_user";
    (document.getElementById("signupEmail") as HTMLInputElement).value = "valid@example.com";
    (document.getElementById("signupPassword") as HTMLInputElement).value = "strong-pass-123";

    submitForm("signupForm");
    await flushPromises(5);

    await waitFor(() => {
      const registerCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes("/api/auth/register")
      );
      expect(registerCall).toBeTruthy();
      expect(document.getElementById("signupError")).toHaveTextContent(
        "That username is not available. Please try another."
      );
      expect(document.querySelector("#signupForm button[type=submit]")).toHaveTextContent(
        "Create Account"
      );
    });
  });

  it("submits valid signup payload and redirects on success", async () => {
    renderLandingDom();
    window.history.pushState({}, "", "/landing?next=/judge");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const setItemSpy = vi.spyOn(localStorage, "setItem");
    const fetchMock = installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
      "POST /api/auth/register": () => jsonResponse({ ok: true }),
    });

    await runBrowserScript(LANDING_SCRIPT);
    (document.getElementById("tabSignUp") as HTMLButtonElement).click();

    (document.getElementById("signupUsername") as HTMLInputElement).value = "valid_user";
    (document.getElementById("signupEmail") as HTMLInputElement).value = "valid@example.com";
    (document.getElementById("signupPassword") as HTMLInputElement).value = "strong-pass-123";

    submitForm("signupForm");
    await flushPromises(5);

    await waitFor(() => {
      const registerCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).includes("/api/auth/register")
      );
      expect(registerCall).toBeTruthy();
      expect(registerCall?.[1]).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      expect(setItemSpy).toHaveBeenCalledWith("maple_judge_username", "valid_user");
    });
  });

  it("validates forgot-password email and shows success copy after delay", async () => {
    vi.useFakeTimers();
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    (document.getElementById("forgotPasswordLink") as HTMLAnchorElement).click();
    expect(document.getElementById("forgotPasswordPane")?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector(".auth-tabs")?.classList.contains("hidden")).toBe(true);

    submitForm("forgotPasswordForm");
    await flushPromises();
    expect(document.getElementById("forgotPasswordError")).toHaveTextContent(
      "Enter a valid email address."
    );

    (document.getElementById("forgotEmail") as HTMLInputElement).value = "person@example.com";
    submitForm("forgotPasswordForm");
    await flushPromises(2);
    await vi.advanceTimersByTimeAsync(1_500);
    await flushPromises(2);

    expect(document.getElementById("forgotPasswordError")).toHaveTextContent(
      "If an account exists with that email, a reset link has been sent."
    );
    expect(document.querySelector("#forgotPasswordForm button[type=submit]")).toHaveTextContent(
      "Send Reset Link"
    );
  });

  it("returns from forgot-password pane back to sign-in", async () => {
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "" }),
    });
    await runBrowserScript(LANDING_SCRIPT);

    (document.getElementById("tabSignUp") as HTMLButtonElement).click();
    (document.getElementById("forgotPasswordLink") as HTMLAnchorElement).click();
    (document.getElementById("forgotBackLink") as HTMLAnchorElement).click();

    expect(document.getElementById("signinPane")?.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("signupPane")?.classList.contains("hidden")).toBe(true);
    expect(document.querySelector(".auth-tabs")?.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("tabSignIn")?.classList.contains("active")).toBe(true);
  });

  it("initializes Google Sign-In when client ID and google API are available", async () => {
    renderLandingDom();
    const initialize = vi.fn();
    const renderButton = vi.fn();
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize,
          renderButton,
        },
      },
    };
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "google-client-id" }),
    });

    await runBrowserScript(LANDING_SCRIPT);
    await flushPromises(5);

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "google-client-id", callback: expect.any(Function) })
    );
    expect(renderButton).toHaveBeenCalled();
    expect(document.getElementById("googleSection")?.classList.contains("hidden")).toBe(false);
  });

  it("hides Google section when Google API never loads after retries", async () => {
    vi.useFakeTimers();
    renderLandingDom();
    installFetchRoutes({
      "GET /api/auth/google/client-id": () => jsonResponse({ clientId: "google-client-id" }),
    });
    await runBrowserScript(LANDING_SCRIPT);
    await flushPromises(5);

    expect(document.getElementById("googleSection")?.classList.contains("hidden")).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises(3);
    expect(document.getElementById("googleSection")?.classList.contains("hidden")).toBe(true);
  });
});
