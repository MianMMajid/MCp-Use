(function () {
  const form = document.getElementById("signinForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const errorEl = document.getElementById("signinError");
  const submitBtn = form ? form.querySelector("button[type=submit]") : null;

  if (
    !(form instanceof HTMLFormElement) ||
    !(usernameInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement)
  ) {
    return;
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
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/judge";
    window.location.assign(safeNext);
  }

  async function handleGoogleSignIn(response) {
    if (errorEl) errorEl.textContent = "";
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (errorEl) errorEl.textContent = data.error || "Google sign-in failed.";
        return;
      }
      navigateAfterLogin();
    } catch (err) {
      if (errorEl) errorEl.textContent = "Connection failed. Is the server running?";
    }
  }

  function initGoogleSignIn() {
    fetch("/api/auth/google/client-id")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.clientId) return;
        var section = document.getElementById("googleSection");
        var container = document.getElementById("googleSignInContainer");
        if (section) section.classList.remove("hidden");

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
          } else {
            setTimeout(tryRender, 200);
          }
        }
        tryRender();
      })
      .catch(function () { /* Google client-id unavailable, keep hidden */ });
  }

  initGoogleSignIn();

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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (errorEl) errorEl.textContent = data.error || "Invalid username or password.";
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Open Dashboard";
        }
        return;
      }

      localStorage.setItem("maple_judge_username", username);
      navigateAfterLogin();
    } catch (err) {
      if (errorEl) errorEl.textContent = "Connection failed. Is the server running?";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Open Dashboard";
      }
    }
  });
})();
