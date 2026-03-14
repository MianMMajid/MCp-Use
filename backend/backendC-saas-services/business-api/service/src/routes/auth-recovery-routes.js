import { hashPassword } from "@maple/security";
import { readJsonBody } from "@maple/common";
import {
  parseForgotPasswordRequest,
  parseResetPasswordRequest,
  parseVerifyEmailConfirmRequest,
  parseVerifyEmailRequest,
} from "../contracts/auth-recovery-contract.js";
import {
  AuthRecoveryStore,
  AuthRecoveryTokenKinds,
} from "../auth-recovery-store.js";

function requestContextFromHeaders(c) {
  return {
    traceId: c.req.header("x-trace-id") ?? "",
    requestId: c.req.header("x-request-id") ?? "",
    tenantId: c.req.header("x-maple-tenant-id") ?? "",
    userId: c.req.header("x-maple-user-id") ?? "",
    deviceId: c.req.header("x-maple-device-id") ?? "",
    sessionId: c.req.header("x-maple-session-id") ?? "",
  };
}

async function maybePublishRecoveryToken(notifier, payload) {
  if (typeof notifier !== "function") {
    return;
  }
  await notifier(payload);
}

export function registerAuthRecoveryRoutes(app, options) {
  const database = options.database;
  const recoveryStore =
    options.recoveryStore ?? new AuthRecoveryStore({ database });
  const onRecoveryTokenIssued = options.onRecoveryTokenIssued;
  const auditEmitter =
    typeof options.auditEmitter === "function" ? options.auditEmitter : () => {};

  app.post("/api/business/auth/forgot-password", async (c) => {
    const parsed = parseForgotPasswordRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const user = await database.findUserByEmail(parsed.value.email);
    if (user) {
      const issued = await recoveryStore.issueToken({
        kind: AuthRecoveryTokenKinds.PASSWORD_RESET,
        userId: user.id,
        email: parsed.value.email,
        redirectUrl: parsed.value.redirectUrl,
      });
      await maybePublishRecoveryToken(onRecoveryTokenIssued, {
        channel: "password_reset",
        userId: user.id,
        email: parsed.value.email,
        redirectUrl: parsed.value.redirectUrl,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    }

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_LOW",
      summary: "business auth forgot-password request",
      context: requestContextFromHeaders(c),
      payload: {
        action: "auth.forgot_password.request",
        emailDomain: parsed.value.email.split("@")[1] ?? "",
        accountMatched: Boolean(user),
      },
    });

    // Always generic response to avoid account enumeration.
    return c.json({ ok: true });
  });

  app.post("/api/business/auth/reset-password", async (c) => {
    const parsed = parseResetPasswordRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const tokenRecord = await recoveryStore.consumeToken({
      kind: AuthRecoveryTokenKinds.PASSWORD_RESET,
      token: parsed.value.token,
    });
    if (!tokenRecord) {
      return c.json({ error: "Reset token is invalid or expired." }, 410);
    }

    const user = await database.findUserById(tokenRecord.userId);
    if (!user) {
      return c.json({ error: "Reset token is invalid or expired." }, 410);
    }

    await database.updatePasswordByUserId(user.id, hashPassword(parsed.value.newPassword));
    await recoveryStore.revokeSessionsByUserId(user.id);

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_MEDIUM",
      summary: "business auth reset-password confirm",
      context: requestContextFromHeaders(c),
      payload: {
        action: "auth.reset_password.confirm",
        userId: user.id,
      },
    });

    return c.json({ ok: true });
  });

  app.post("/api/business/auth/verify-email/request", async (c) => {
    const parsed = parseVerifyEmailRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const user = await database.findUserByEmail(parsed.value.email);
    if (user) {
      const issued = await recoveryStore.issueToken({
        kind: AuthRecoveryTokenKinds.VERIFY_EMAIL,
        userId: user.id,
        email: parsed.value.email,
      });
      await maybePublishRecoveryToken(onRecoveryTokenIssued, {
        channel: "verify_email",
        userId: user.id,
        email: parsed.value.email,
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    }

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_LOW",
      summary: "business auth verify-email request",
      context: requestContextFromHeaders(c),
      payload: {
        action: "auth.verify_email.request",
        emailDomain: parsed.value.email.split("@")[1] ?? "",
        accountMatched: Boolean(user),
      },
    });

    return c.json({ ok: true });
  });

  app.post("/api/business/auth/verify-email/confirm", async (c) => {
    const parsed = parseVerifyEmailConfirmRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const tokenRecord = await recoveryStore.consumeToken({
      kind: AuthRecoveryTokenKinds.VERIFY_EMAIL,
      token: parsed.value.token,
    });
    if (!tokenRecord) {
      return c.json({ error: "Verification token is invalid or expired." }, 410);
    }

    const user = await database.findUserById(tokenRecord.userId);
    if (!user) {
      return c.json({ error: "Verification token is invalid or expired." }, 410);
    }

    await recoveryStore.markEmailVerified({
      userId: user.id,
      email: tokenRecord.email,
    });

    auditEmitter({
      eventType: "AUDIT_EVENT_TYPE_POLICY_EVALUATED",
      severity: "RISK_SEVERITY_LOW",
      summary: "business auth verify-email confirm",
      context: requestContextFromHeaders(c),
      payload: {
        action: "auth.verify_email.confirm",
        userId: user.id,
      },
    });

    return c.json({ ok: true });
  });
}
