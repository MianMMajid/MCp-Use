import { randomUUID } from "node:crypto";
import { database } from "../state.js";
import {
  sessionTtlSeconds,
  googleClientId,
  allowSelfSignup,
  sessionCookieName,
} from "../config.js";
import { buildSessionCookie, verifyGoogleJwt } from "../auth.js";
import { parseCookieHeader, findRequestSession } from "../auth-session.js";
import { asString, readJsonBody } from "../helpers.js";
import { buildSessionAuthResponse } from "./auth-routes-common.js";
import {
  completeCliBrowserFlow,
  createCliBrowserFlow,
  failCliBrowserFlow,
  getCliBrowserFlow,
  serializeCliBrowserFlow,
} from "../core/cli-browser-flow-store.js";

function flowOrigin(c) {
  return new URL(c.req.url).origin;
}

function cliFlowPath(flowId) {
  return `/api/auth/google/cli/${encodeURIComponent(flowId)}`;
}

function browserPageHtml({ clientId, completeUrl, postUrl }) {
  const escapedClientId = JSON.stringify(clientId);
  const escapedPostUrl = JSON.stringify(postUrl);
  const escapedCompleteUrl = JSON.stringify(completeUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Maple CLI Google Login</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <main style="font-family: sans-serif; max-width: 36rem; margin: 3rem auto; line-height: 1.5;">
    <h1>Continue Maple CLI Login</h1>
    <p>Complete Google sign-in in this browser tab. The CLI will detect the session automatically.</p>
    <div id="google-signin"></div>
    <p id="status">Waiting for Google sign-in…</p>
  </main>
  <script>
    const statusEl = document.getElementById("status");
    function setStatus(message) {
      statusEl.textContent = message;
    }
    async function handleCredentialResponse(response) {
      setStatus("Verifying Google login…");
      const result = await fetch(${escapedPostUrl}, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credential: response.credential })
      });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok) {
        throw new Error(payload.error || "Google login failed.");
      }
      window.location.assign(${escapedCompleteUrl});
    }
    window.onload = () => {
      if (!window.google?.accounts?.id) {
        setStatus("Google sign-in SDK failed to load.");
        return;
      }
      google.accounts.id.initialize({
        client_id: ${escapedClientId},
        callback: (response) => {
          handleCredentialResponse(response).catch((error) => {
            setStatus(error.message || "Google login failed.");
          });
        }
      });
      google.accounts.id.renderButton(
        document.getElementById("google-signin"),
        { theme: "outline", size: "large", width: "280" }
      );
      setStatus("Ready. Choose your Google account.");
    };
  </script>
</body>
</html>`;
}

async function resolveGoogleUser(body, resolvedGoogleClientId) {
  if (!resolvedGoogleClientId) {
    throw Object.assign(new Error("Google sign-in is unavailable."), { statusCode: 503 });
  }
  const credential = asString(body.credential);
  if (!credential) {
    throw Object.assign(new Error("credential is required."), { statusCode: 400 });
  }
  try {
    return await verifyGoogleJwt(credential);
  } catch (err) {
    throw Object.assign(
      new Error(err instanceof Error ? err.message : "Token verification failed"),
      { statusCode: 401 }
    );
  }
}

async function ensureGoogleUserProvisioned(googleUser) {
  if (googleUser.email_verified !== true) {
    throw Object.assign(new Error("Google account email is not verified."), { statusCode: 403 });
  }

  let user = await database.findUserByEmail(googleUser.email);
  if (!user && !allowSelfSignup) {
    throw Object.assign(
      new Error("Self-registration is disabled. Contact your administrator."),
      { statusCode: 403 }
    );
  }
  if (!user) {
    let baseUsername = googleUser.email
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 30);
    if (!baseUsername) {
      baseUsername = "user";
    }
    let username = baseUsername;
    while (await database.findUserByUsername(username)) {
      username = `${baseUsername}_${randomUUID().slice(0, 6)}`;
    }
    user = await database.createUser({
      username,
      email: googleUser.email,
      passwordHash: "google-oauth:no-password",
    });
  }
  return user;
}

export function registerAuthGoogleRoutes(app) {
  const resolvedGoogleClientId = asString(process.env.GOOGLE_CLIENT_ID) ?? googleClientId;

  app.get("/api/auth/google/client-id", async (c) =>
    c.json({
      clientId: resolvedGoogleClientId,
      configured: Boolean(resolvedGoogleClientId),
    })
  );

  app.post("/api/auth/google/cli/start", async (c) => {
    if (!resolvedGoogleClientId) {
      return c.json({ error: "Google sign-in is unavailable." }, 503);
    }
    const flow = createCliBrowserFlow("auth-google", {});
    const origin = flowOrigin(c);
    return c.json({
      ok: true,
      flowId: flow.flowId,
      browserUrl: `${origin}${cliFlowPath(flow.flowId)}?view=browser`,
      pollUrl: cliFlowPath(flow.flowId),
      expiresAt: flow.expiresAt,
    });
  });

  app.get("/api/auth/google/cli/:flowId", async (c) => {
    const flowId = asString(c.req.param("flowId"));
    const flow = getCliBrowserFlow(flowId);
    if (!flow || flow.kind !== "auth-google") {
      return c.json({ error: "CLI Google auth flow not found." }, 404);
    }

    if (String(c.req.query("view")).trim().toLowerCase() === "browser") {
      if (!resolvedGoogleClientId) {
        failCliBrowserFlow(flowId, "Google sign-in is unavailable.");
        return new Response("Google sign-in is unavailable.", { status: 503 });
      }
      if (String(c.req.query("complete")).trim() === "1") {
        const session = await findRequestSession(database, c.req.header("cookie"));
        if (!session) {
          failCliBrowserFlow(flowId, "Google session was not established.");
          return new Response("Google session was not established.", { status: 401 });
        }
        const cookies = parseCookieHeader(c.req.header("cookie"));
        completeCliBrowserFlow(flowId, {
          sessionCookie: {
            cookieName: sessionCookieName,
            cookieValue: cookies[sessionCookieName] || "",
            maxAgeSeconds: sessionTtlSeconds,
          },
          user: session.user,
        });
        return new Response(
          "<!DOCTYPE html><html><body><p>Login complete. Return to the Maple CLI.</p></body></html>",
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        );
      }

      const completeUrl = `${flowOrigin(c)}${cliFlowPath(flowId)}?view=browser&complete=1`;
      return new Response(
        browserPageHtml({
          clientId: resolvedGoogleClientId,
          postUrl: "/api/auth/google",
          completeUrl,
        }),
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }

    return c.json(serializeCliBrowserFlow(flow));
  });

  app.post("/api/auth/google", async (c) => {
    const body = await readJsonBody(c);
    try {
      const googleUser = await resolveGoogleUser(body, resolvedGoogleClientId);
      const user = await ensureGoogleUserProvisioned(googleUser);
      const session = await database.createSession(user.id, sessionTtlSeconds);
      c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));
      return c.json({
        ...buildSessionAuthResponse(user, session),
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Google sign-in failed." },
        err?.statusCode || 500
      );
    }
  });
}
