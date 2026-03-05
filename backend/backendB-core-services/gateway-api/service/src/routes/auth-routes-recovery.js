import { hashPassword } from "@maple/security";
import { readJsonBody } from "../helpers.js";
import { database } from "../state.js";
import {
  parseForgotPasswordRequest,
  parseResetPasswordRequest,
  parseVerifyEmailConfirmRequest,
  parseVerifyEmailRequest,
} from "../contracts/auth-recovery-contract.js";
import {
  AuthRecoveryStore,
  AuthRecoveryTokenKinds,
} from "../core/auth-recovery-store.js";
import { createRecoveryNotificationPublisher } from "../core/recovery-notifier.js";
import { mapleLog } from "../logging.js";

// In-memory rate limiter for recovery endpoints
const recoveryAttempts = new Map();
const RECOVERY_RATE_LIMIT_MAX = 5;
const RECOVERY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRecoveryRateLimit(ip) {
  const now = Date.now();
  const entry = recoveryAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    recoveryAttempts.set(ip, { count: 1, resetAt: now + RECOVERY_RATE_LIMIT_WINDOW_MS });
    return null;
  }

  entry.count++;
  if (entry.count > RECOVERY_RATE_LIMIT_MAX) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of recoveryAttempts) {
    if (now > entry.resetAt) recoveryAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

async function maybePublishRecoveryToken(notifier, payload) {
  if (typeof notifier !== "function") {
    return;
  }
  await notifier(payload);
}

let _recoveryStore;
let _onRecoveryTokenIssued;

function getRecoveryStore() {
  if (!_recoveryStore) {
    _recoveryStore = new AuthRecoveryStore({ database });
  }
  return _recoveryStore;
}

function getOnRecoveryTokenIssued() {
  if (_onRecoveryTokenIssued === undefined) {
    try {
      _onRecoveryTokenIssued = createRecoveryNotificationPublisher();
    } catch (err) {
      mapleLog("warn", "gateway.recovery_notifier_init_failed", { error: err.message });
      _onRecoveryTokenIssued = null;
    }
  }
  return _onRecoveryTokenIssued;
}

export function registerAuthRecoveryRoutes(app) {
  app.post("/api/auth/forgot-password", async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const retryAfter = checkRecoveryRateLimit(ip);
    if (retryAfter) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: "Too many requests. Please try again later." }, 429);
    }

    const parsed = parseForgotPasswordRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const recoveryStore = getRecoveryStore();
    const onRecoveryTokenIssued = getOnRecoveryTokenIssued();

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

    // Always generic response to avoid account enumeration.
    return c.json({ ok: true });
  });

  // Backward-compatible alias used by landing forgot-password flow.
  app.post("/api/auth/password-reset", async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const retryAfter = checkRecoveryRateLimit(ip);
    if (retryAfter) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: "Too many requests. Please try again later." }, 429);
    }

    const parsed = parseForgotPasswordRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const recoveryStore = getRecoveryStore();
    const onRecoveryTokenIssued = getOnRecoveryTokenIssued();

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

    return c.json({ ok: true });
  });

  app.post("/api/auth/reset-password", async (c) => {
    const parsed = parseResetPasswordRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const recoveryStore = getRecoveryStore();

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

    return c.json({ ok: true });
  });

  app.post("/api/auth/verify-email/request", async (c) => {
    const parsed = parseVerifyEmailRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const recoveryStore = getRecoveryStore();
    const onRecoveryTokenIssued = getOnRecoveryTokenIssued();

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

    return c.json({ ok: true });
  });

  app.post("/api/auth/verify-email/confirm", async (c) => {
    const parsed = parseVerifyEmailConfirmRequest(await readJsonBody(c));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const recoveryStore = getRecoveryStore();

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

    return c.json({ ok: true });
  });
}
