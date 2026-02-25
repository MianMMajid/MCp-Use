(function () {
  const FETCH_TIMEOUT_MS = 12000;

  const form = document.getElementById("signinForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const errorEl = document.getElementById("signinError");
  const submitBtn = form ? form.querySelector("button[type=submit]") : null;

  const signupForm = document.getElementById("signupForm");
  const signupUsername = document.getElementById("signupUsername");
  const signupEmail = document.getElementById("signupEmail");
  const signupPassword = document.getElementById("signupPassword");
  const signupError = document.getElementById("signupError");
  const signupSubmitBtn = signupForm ? signupForm.querySelector("button[type=submit]") : null;

  const tabSignIn = document.getElementById("tabSignIn");
  const tabSignUp = document.getElementById("tabSignUp");
  const signinPane = document.getElementById("signinPane");
  const signupPane = document.getElementById("signupPane");

  if (
    !(form instanceof HTMLFormElement) ||
    !(usernameInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement)
  ) {
    console.warn("[landing] Required form elements not found in DOM");
    return;
  }

  // --- Tab switching ---
  function switchTab(tab) {
    if (tab === "signin") {
      tabSignIn.classList.add("active");
      tabSignUp.classList.remove("active");
      signinPane.classList.remove("hidden");
      signupPane.classList.add("hidden");
    } else {
      tabSignUp.classList.add("active");
      tabSignIn.classList.remove("active");
      signupPane.classList.remove("hidden");
      signinPane.classList.add("hidden");
    }
  }

  if (tabSignIn) tabSignIn.addEventListener("click", () => switchTab("signin"));
  if (tabSignUp) tabSignUp.addEventListener("click", () => switchTab("signup"));

  // --- Fetch with timeout ---
  function fetchWithTimeout(url, options, timeoutMs) {
    if (timeoutMs === undefined) timeoutMs = FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .then(function (res) { clearTimeout(timer); return res; })
      .catch(function (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") throw new Error("Request timed out.");
        throw err;
      });
  }

  const savedUsername = localStorage.getItem("maple_judge_username");
  if (savedUsername) {
    usernameInput.value = savedUsername;
    passwordInput.focus();
  }

  // --- Google Sign-In ---
  function navigateAfterLogin() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/judge";
    const safeNext = /^\/[a-zA-Z0-9_\-\/\.]+$/.test(next) ? next : "/judge";
    window.location.assign(safeNext);
  }

  async function handleGoogleSignIn(response) {
    if (errorEl) errorEl.textContent = "";
    try {
      const res = await fetchWithTimeout("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credential: response.credential }),
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error(`Unexpected response (${res.status})`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (errorEl) errorEl.textContent = data.error || "Google sign-in failed.";
        return;
      }
      navigateAfterLogin();
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "Connection failed. Is the server running?";
    }
  }

  function initGoogleSignIn() {
    // Best-effort — no timeout wrapper for client-id fetch
    fetch("/api/auth/google/client-id")
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(function (data) {
        if (!data.clientId) return;
        var section = document.getElementById("googleSection");
        var container = document.getElementById("googleSignInContainer");
        if (section) section.classList.remove("hidden");

        var renderTimerId;
        var tryRenderAttempts = 0;
        var MAX_RENDER_ATTEMPTS = 50; // 10 seconds max (50 * 200ms)
        function tryRender() {
          if (typeof google !== "undefined" && google.accounts && google.accounts.id) {
            google.accounts.id.initialize({
              client_id: data.clientId,
              callback: handleGoogleSignIn,
            });
            if (container) {
              google.accounts.id.renderButton(container, {
                theme: "outline",
                size: "large",
                width: container.offsetWidth || 300,
              });
            }
          } else if (++tryRenderAttempts < MAX_RENDER_ATTEMPTS) {
            renderTimerId = setTimeout(tryRender, 200);
          } else {
            if (section) section.classList.add("hidden");
          }
        }
        tryRender();
        window.addEventListener("beforeunload", function() { clearTimeout(renderTimerId); });
      })
      .catch(function () { /* Google client-id unavailable, keep hidden */ });
  }

  initGoogleSignIn();

  // --- Sign-in form ---
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username) {
      if (errorEl) errorEl.textContent = "Enter your username.";
      usernameInput.focus();
      return;
    }
    if (!password) {
      if (errorEl) errorEl.textContent = "Enter your password.";
      passwordInput.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing in\u2026";
    }

    try {
      const res = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error(`Unexpected response (${res.status})`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (errorEl) errorEl.textContent = data.error || "Invalid username or password.";
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Open Dashboard";
        }
        return;
      }

      localStorage.setItem("maple_judge_username", username.replace(/[<>"'&]/g, ""));
      navigateAfterLogin();
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "Connection failed. Is the server running?";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Open Dashboard";
      }
    }
  });

  // --- Sign-up form ---
  if (signupForm instanceof HTMLFormElement && signupUsername instanceof HTMLInputElement && signupPassword instanceof HTMLInputElement) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (signupError) signupError.textContent = "";

      const username = signupUsername.value.trim();
      const email = signupEmail instanceof HTMLInputElement ? signupEmail.value.trim() : "";
      const password = signupPassword.value;

      if (!username) {
        if (signupError) signupError.textContent = "Enter a username.";
        signupUsername.focus();
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        if (signupError) signupError.textContent = "Username may only contain letters, numbers, underscores, dots, and hyphens.";
        signupUsername.focus();
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (signupError) signupError.textContent = "Enter a valid email address.";
        signupEmail.focus();
        return;
      }
      if (password.length < 8) {
        if (signupError) signupError.textContent = "Password must be at least 8 characters.";
        signupPassword.focus();
        return;
      }

      if (signupSubmitBtn) {
        signupSubmitBtn.disabled = true;
        signupSubmitBtn.textContent = "Creating account\u2026";
      }

      try {
        const body = { username, password };
        if (email) body.email = email;

        const res = await fetchWithTimeout("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error(`Unexpected response (${res.status})`);
        const data = await res.json();

        if (!res.ok || !data.ok) {
          let msg = data.error || "Registration failed.";
          if (res.status === 403) msg = "Account registration is currently disabled.";
          if (res.status === 409) msg = "Username is already taken.";
          if (res.status === 400) msg = data.error || "Invalid input. Check your fields.";
          if (signupError) signupError.textContent = msg;
          if (signupSubmitBtn) {
            signupSubmitBtn.disabled = false;
            signupSubmitBtn.textContent = "Create Account";
          }
          return;
        }

        localStorage.setItem("maple_judge_username", username.replace(/[<>"'&]/g, ""));
        navigateAfterLogin();
      } catch (err) {
        if (signupError) signupError.textContent = err.message || "Connection failed. Is the server running?";
        if (signupSubmitBtn) {
          signupSubmitBtn.disabled = false;
          signupSubmitBtn.textContent = "Create Account";
        }
      }
    });
  }

  // --- Forgot Password ---
  const forgotLink = document.getElementById("forgotPasswordLink");
  const forgotPane = document.getElementById("forgotPasswordPane");
  const forgotForm = document.getElementById("forgotPasswordForm");
  const forgotEmail = document.getElementById("forgotEmail");
  const forgotError = document.getElementById("forgotPasswordError");
  const forgotBackLink = document.getElementById("forgotBackLink");

  if (forgotLink) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (signinPane) signinPane.classList.add("hidden");
      if (signupPane) signupPane.classList.add("hidden");
      if (forgotPane) forgotPane.classList.remove("hidden");
      const tabs = document.querySelector(".auth-tabs");
      if (tabs) tabs.classList.add("hidden");
    });
  }

  if (forgotBackLink) {
    forgotBackLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (forgotPane) forgotPane.classList.add("hidden");
      if (signinPane) signinPane.classList.remove("hidden");
      const tabs = document.querySelector(".auth-tabs");
      if (tabs) tabs.classList.remove("hidden");
      switchTab("signin");
    });
  }

  if (forgotForm instanceof HTMLFormElement && forgotEmail instanceof HTMLInputElement) {
    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (forgotError) forgotError.textContent = "";
      const email = forgotEmail.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (forgotError) forgotError.textContent = "Enter a valid email address.";
        forgotEmail.focus();
        return;
      }
      const btn = forgotForm.querySelector("button[type=submit]");
      if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
      // Placeholder: backend does not have a reset endpoint yet
      setTimeout(() => {
        if (forgotError) {
          forgotError.style.color = "var(--accent)";
          forgotError.textContent = "If an account exists with that email, a reset link has been sent.";
        }
        if (btn) { btn.disabled = false; btn.textContent = "Send Reset Link"; }
      }, 1500);
    });
  }
})();
