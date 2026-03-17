/**
 * auth-routes-mfa.js
 *
 * MFA (Multi-Factor Authentication) endpoints:
 * - POST /api/auth/mfa/setup — initiate TOTP enrollment
 * - POST /api/auth/mfa/verify-setup — confirm TOTP setup with first code
 * - POST /api/auth/mfa/challenge — verify TOTP code during login
 * - POST /api/auth/mfa/verify — verify code for active session upgrade
 * - POST /api/auth/mfa/disable — disable MFA for user
 */
import { randomUUID, createHash } from "node:crypto";
import { database } from "../state.js";
import { findRequestSession } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { emitAuditEvent } from "../audit-emitter.js";
import { mapleLog } from "../logging.js";
import { buildSessionCookie, sessionCookieValue } from "../auth-session.js";
import { sessionTtlSeconds } from "../config.js";

// Lazy-load MFA utilities (may not be available if maple-security isn't updated)
let mfaModule = null;
async function getMfa() {
  if (mfaModule) return mfaModule;
  try {
    mfaModule = await import("@maple/security/mfa");
  } catch {
    try {
      mfaModule = await import("../../../../shared/packages/maple-security/src/mfa.js");
    } catch {
      return null;
    }
  }
  return mfaModule;
}

const MFA_ENCRYPTION_KEY = process.env.MAPLE_MFA_ENCRYPTION_KEY || "0".repeat(64);
const MFA_ENFORCE_FOR_ADMINS = process.env.MAPLE_MFA_ENFORCE_FOR_ADMINS === "1";
const MFA_SESSION_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MFA_MAX_ATTEMPTS = 5;
const MFA_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MFA_TRUST_COOKIE_NAME = "maple_mfa_trust";
const MFA_TRUST_TTL_DAYS = 30;

// In-memory MFA session tokens (for challenge flow)
const mfaSessions = new Map(); // token -> { userId, createdAt, attempts }

// In-memory lockout tracking
const mfaLockouts = new Map(); // userId -> { lockedUntil }

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of mfaSessions) {
    if (now - session.createdAt > MFA_SESSION_TOKEN_TTL_MS) mfaSessions.delete(token);
  }
  for (const [userId, lockout] of mfaLockouts) {
    if (now > lockout.lockedUntil) mfaLockouts.delete(userId);
  }
}, 60_000).unref();

async function requireSession(c) {
  const session = await findRequestSession(database, c.req.header("cookie"));
  if (!session) return { error: c.json({ error: "Authentication required." }, 401) };
  return { session };
}

async function ensureMfaTables() {
  const pool = database?.pool;
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_mfa_methods (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'totp',
      secret_encrypted TEXT NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, method)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      used_at TIMESTAMPTZ DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mfa_methods_user ON user_mfa_methods(user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON user_mfa_recovery_codes(user_id)
  `);

  // Add mfa_verified column to sessions if not present
  try {
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN DEFAULT FALSE`);
  } catch { /* column may exist */ }
}

let _tablesEnsured = false;

export function registerAuthMfaRoutes(app) {
  // ── Setup TOTP ────────────────────────────────────────────────────────
  app.post("/api/auth/mfa/setup", async (c) => {
    const mfa = await getMfa();
    if (!mfa) return c.json({ error: "MFA module not available." }, 503);

    const auth = await requireSession(c);
    if (auth.error) return auth.error;

    if (!_tablesEnsured) { await ensureMfaTables(); _tablesEnsured = true; }

    const userId = auth.session.userId;
    const pool = database.pool;

    // Check if MFA is already set up
    const existing = await pool.query(
      `SELECT id, verified FROM user_mfa_methods WHERE user_id = $1 AND method = 'totp' LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0 && existing.rows[0].verified) {
      return c.json({ error: "MFA is already enabled. Disable it first to re-enroll." }, 409);
    }

    // Generate secret
    const secret = mfa.generateTotpSecret();
    const encrypted = mfa.encryptSecret(secret, MFA_ENCRYPTION_KEY);
    const accountName = auth.session.user?.email || auth.session.user?.username || userId;
    const uri = mfa.buildTotpUri({ secret, issuer: "Mayple", accountName });

    // Generate recovery codes
    const recoveryCodes = mfa.generateRecoveryCodes();
    const codeHashes = recoveryCodes.map((code) => mfa.hashRecoveryCode(code));

    // Upsert MFA method (not yet verified)
    await pool.query(
      `INSERT INTO user_mfa_methods (user_id, method, secret_encrypted, verified)
       VALUES ($1, 'totp', $2, FALSE)
       ON CONFLICT (user_id, method) DO UPDATE SET secret_encrypted = $2, verified = FALSE`,
      [userId, encrypted]
    );

    // Replace recovery codes
    await pool.query(`DELETE FROM user_mfa_recovery_codes WHERE user_id = $1`, [userId]);
    for (const hash of codeHashes) {
      await pool.query(
        `INSERT INTO user_mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
        [userId, hash]
      );
    }

    return c.json({
      ok: true,
      totpUri: uri,
      secret, // Show once for manual entry
      recoveryCodes, // Show once — user must save these
      message: "Scan the QR code with your authenticator app, then verify with a code.",
    });
  });

  // ── Verify Setup ──────────────────────────────────────────────────────
  app.post("/api/auth/mfa/verify-setup", async (c) => {
    const mfa = await getMfa();
    if (!mfa) return c.json({ error: "MFA module not available." }, 503);

    const auth = await requireSession(c);
    if (auth.error) return auth.error;

    if (!_tablesEnsured) { await ensureMfaTables(); _tablesEnsured = true; }

    const userId = auth.session.userId;
    const body = await readJsonBody(c);
    const code = asString(body.code)?.replace(/\s/g, "");

    if (!code || code.length !== 6) {
      return c.json({ error: "A 6-digit TOTP code is required." }, 400);
    }

    const pool = database.pool;
    const result = await pool.query(
      `SELECT secret_encrypted, verified FROM user_mfa_methods WHERE user_id = $1 AND method = 'totp' LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: "MFA setup not initiated. Call /api/auth/mfa/setup first." }, 400);
    }

    if (result.rows[0].verified) {
      return c.json({ error: "MFA is already verified." }, 409);
    }

    const secret = mfa.decryptSecret(result.rows[0].secret_encrypted, MFA_ENCRYPTION_KEY);
    const valid = mfa.verifyTotpCode(secret, code);

    if (!valid) {
      return c.json({ error: "Invalid TOTP code. Please try again." }, 401);
    }

    // Mark as verified
    await pool.query(
      `UPDATE user_mfa_methods SET verified = TRUE WHERE user_id = $1 AND method = 'totp'`,
      [userId]
    );

    // Upgrade current session to MFA-verified
    try {
      await pool.query(
        `UPDATE sessions SET mfa_verified = TRUE WHERE id = $1`,
        [auth.session.id]
      );
    } catch { /* column may not exist */ }

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_MFA_ENABLED",
      sourceService: "gateway-api",
      userId,
      severity: "RISK_SEVERITY_MEDIUM",
      summary: `MFA enabled for user ${userId}`,
      payload: { method: "totp" },
    });

    return c.json({ ok: true, message: "MFA setup complete. Your account is now protected with two-factor authentication." });
  });

  // ── Challenge (during login) ──────────────────────────────────────────
  app.post("/api/auth/mfa/challenge", async (c) => {
    const mfa = await getMfa();
    if (!mfa) return c.json({ error: "MFA module not available." }, 503);

    if (!_tablesEnsured) { await ensureMfaTables(); _tablesEnsured = true; }

    const body = await readJsonBody(c);
    const mfaSessionToken = asString(body.mfaSessionToken);
    const code = asString(body.code)?.replace(/\s/g, "");
    const recoveryCode = asString(body.recoveryCode)?.replace(/\s/g, "");
    const trustDevice = body.trustDevice === true;

    if (!mfaSessionToken) {
      return c.json({ error: "mfaSessionToken is required." }, 400);
    }

    const mfaSession = mfaSessions.get(mfaSessionToken);
    if (!mfaSession) {
      return c.json({ error: "MFA session expired. Please log in again." }, 401);
    }

    // Check token expiry
    if (Date.now() - mfaSession.createdAt > MFA_SESSION_TOKEN_TTL_MS) {
      mfaSessions.delete(mfaSessionToken);
      return c.json({ error: "MFA session expired. Please log in again." }, 401);
    }

    const userId = mfaSession.userId;

    // Check lockout
    const lockout = mfaLockouts.get(userId);
    if (lockout && Date.now() < lockout.lockedUntil) {
      const remaining = Math.ceil((lockout.lockedUntil - Date.now()) / 1000);
      return c.json({
        error: `Account temporarily locked. Try again in ${remaining} seconds.`,
        lockedUntil: lockout.lockedUntil,
        retryAfter: remaining,
      }, 429);
    }

    const pool = database.pool;

    // Try recovery code first
    if (recoveryCode) {
      const codes = await pool.query(
        `SELECT id, code_hash FROM user_mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
        [userId]
      );

      for (const row of codes.rows) {
        if (mfa.verifyRecoveryCode(recoveryCode, row.code_hash)) {
          // Mark recovery code as used
          await pool.query(
            `UPDATE user_mfa_recovery_codes SET used_at = NOW() WHERE id = $1`,
            [row.id]
          );

          mfaSessions.delete(mfaSessionToken);
          return await completeMfaLogin(c, userId, trustDevice);
        }
      }

      mfaSession.attempts = (mfaSession.attempts ?? 0) + 1;
      if (mfaSession.attempts >= MFA_MAX_ATTEMPTS) {
        mfaSessions.delete(mfaSessionToken);
        mfaLockouts.set(userId, { lockedUntil: Date.now() + MFA_LOCKOUT_MS });
        return c.json({ error: "Too many failed attempts. Account locked for 15 minutes." }, 429);
      }

      return c.json({ error: "Invalid recovery code.", attemptsRemaining: MFA_MAX_ATTEMPTS - mfaSession.attempts }, 401);
    }

    // Verify TOTP code
    if (!code || code.length !== 6) {
      return c.json({ error: "A 6-digit code or recovery code is required." }, 400);
    }

    const mfaResult = await pool.query(
      `SELECT secret_encrypted FROM user_mfa_methods WHERE user_id = $1 AND method = 'totp' AND verified = TRUE LIMIT 1`,
      [userId]
    );

    if (mfaResult.rows.length === 0) {
      mfaSessions.delete(mfaSessionToken);
      return c.json({ error: "MFA not configured." }, 400);
    }

    const secret = mfa.decryptSecret(mfaResult.rows[0].secret_encrypted, MFA_ENCRYPTION_KEY);
    const valid = mfa.verifyTotpCode(secret, code);

    if (!valid) {
      mfaSession.attempts = (mfaSession.attempts ?? 0) + 1;
      if (mfaSession.attempts >= MFA_MAX_ATTEMPTS) {
        mfaSessions.delete(mfaSessionToken);
        mfaLockouts.set(userId, { lockedUntil: Date.now() + MFA_LOCKOUT_MS });
        return c.json({ error: "Too many failed attempts. Account locked for 15 minutes." }, 429);
      }

      return c.json({
        error: "Invalid MFA code. Please try again.",
        attemptsRemaining: MFA_MAX_ATTEMPTS - mfaSession.attempts,
      }, 401);
    }

    mfaSessions.delete(mfaSessionToken);
    return await completeMfaLogin(c, userId, trustDevice);
  });

  // ── Verify (session upgrade) ──────────────────────────────────────────
  app.post("/api/auth/mfa/verify", async (c) => {
    const mfa = await getMfa();
    if (!mfa) return c.json({ error: "MFA module not available." }, 503);

    const auth = await requireSession(c);
    if (auth.error) return auth.error;

    if (!_tablesEnsured) { await ensureMfaTables(); _tablesEnsured = true; }

    const userId = auth.session.userId;
    const body = await readJsonBody(c);
    const code = asString(body.code)?.replace(/\s/g, "");

    if (!code || code.length !== 6) {
      return c.json({ error: "A 6-digit TOTP code is required." }, 400);
    }

    const pool = database.pool;
    const result = await pool.query(
      `SELECT secret_encrypted FROM user_mfa_methods WHERE user_id = $1 AND method = 'totp' AND verified = TRUE LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: "MFA not configured." }, 400);
    }

    const secret = mfa.decryptSecret(result.rows[0].secret_encrypted, MFA_ENCRYPTION_KEY);
    const valid = mfa.verifyTotpCode(secret, code);

    if (!valid) {
      return c.json({ error: "Invalid MFA code." }, 401);
    }

    // Upgrade session
    try {
      await pool.query(
        `UPDATE sessions SET mfa_verified = TRUE WHERE id = $1`,
        [auth.session.id]
      );
    } catch { /* column may not exist */ }

    return c.json({ ok: true, mfaVerified: true });
  });

  // ── Disable MFA ───────────────────────────────────────────────────────
  app.post("/api/auth/mfa/disable", async (c) => {
    const mfa = await getMfa();
    if (!mfa) return c.json({ error: "MFA module not available." }, 503);

    const auth = await requireSession(c);
    if (auth.error) return auth.error;

    if (!_tablesEnsured) { await ensureMfaTables(); _tablesEnsured = true; }

    const userId = auth.session.userId;
    const body = await readJsonBody(c);
    const code = asString(body.code)?.replace(/\s/g, "");

    // Require current TOTP code to disable
    const pool = database.pool;
    const result = await pool.query(
      `SELECT secret_encrypted FROM user_mfa_methods WHERE user_id = $1 AND method = 'totp' AND verified = TRUE LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: "MFA is not enabled." }, 400);
    }

    if (!code || code.length !== 6) {
      return c.json({ error: "Current TOTP code is required to disable MFA." }, 400);
    }

    const secret = mfa.decryptSecret(result.rows[0].secret_encrypted, MFA_ENCRYPTION_KEY);
    const valid = mfa.verifyTotpCode(secret, code);

    if (!valid) {
      return c.json({ error: "Invalid TOTP code." }, 401);
    }

    // Delete MFA data
    await pool.query(`DELETE FROM user_mfa_methods WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM user_mfa_recovery_codes WHERE user_id = $1`, [userId]);

    emitAuditEvent({
      eventType: "AUDIT_EVENT_TYPE_MFA_DISABLED",
      sourceService: "gateway-api",
      userId,
      severity: "RISK_SEVERITY_HIGH",
      summary: `MFA disabled for user ${userId}`,
      payload: { method: "totp" },
    });

    return c.json({ ok: true, message: "MFA has been disabled." });
  });

  // ── MFA status ────────────────────────────────────────────────────────
  app.get("/api/auth/mfa/status", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) return auth.error;

    if (!_tablesEnsured) { await ensureMfaTables(); _tablesEnsured = true; }

    const userId = auth.session.userId;
    const pool = database.pool;

    try {
      const result = await pool.query(
        `SELECT method, verified, created_at FROM user_mfa_methods WHERE user_id = $1`,
        [userId]
      );

      const codesResult = await pool.query(
        `SELECT COUNT(*) as total, COUNT(used_at) as used FROM user_mfa_recovery_codes WHERE user_id = $1`,
        [userId]
      );

      const methods = result.rows.map((row) => ({
        method: row.method,
        verified: row.verified,
        enrolledAt: row.created_at,
      }));

      const totalCodes = parseInt(codesResult.rows[0]?.total ?? "0", 10);
      const usedCodes = parseInt(codesResult.rows[0]?.used ?? "0", 10);

      return c.json({
        ok: true,
        mfaEnabled: methods.some((m) => m.verified),
        methods,
        recoveryCodesRemaining: totalCodes - usedCodes,
        enforceForAdmins: MFA_ENFORCE_FOR_ADMINS,
      });
    } catch {
      return c.json({ ok: true, mfaEnabled: false, methods: [], recoveryCodesRemaining: 0 });
    }
  });
}

/**
 * Create MFA session token (called from login flow when MFA is required).
 */
export function createMfaSessionToken(userId) {
  const token = randomUUID();
  // Invalidate any existing MFA sessions for this user
  for (const [existingToken, session] of mfaSessions) {
    if (session.userId === userId) mfaSessions.delete(existingToken);
  }
  mfaSessions.set(token, { userId, createdAt: Date.now(), attempts: 0 });
  return token;
}

/**
 * Check if a user has MFA enabled.
 */
export async function userHasMfa(userId) {
  const pool = database?.pool;
  if (!pool) return false;

  try {
    const result = await pool.query(
      `SELECT verified FROM user_mfa_methods WHERE user_id = $1 AND method = 'totp' AND verified = TRUE LIMIT 1`,
      [userId]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if the user's device is trusted (has valid trust cookie).
 */
export function isDeviceTrusted(cookieHeader, userId) {
  if (!cookieHeader) return false;
  const cookies = {};
  for (const part of cookieHeader.split(";")) {
    const [name, ...val] = part.split("=");
    if (name?.trim()) cookies[name.trim()] = val.join("=").trim();
  }
  const trustToken = cookies[MFA_TRUST_COOKIE_NAME];
  if (!trustToken) return false;

  try {
    const decoded = Buffer.from(trustToken, "base64").toString("utf8");
    const { uid, exp } = JSON.parse(decoded);
    return uid === userId && exp > Date.now();
  } catch {
    return false;
  }
}

async function completeMfaLogin(c, userId, trustDevice) {
  const session = await database.createSession(userId, sessionTtlSeconds);

  // Mark session as MFA-verified
  try {
    await database.pool.query(
      `UPDATE sessions SET mfa_verified = TRUE WHERE id = $1`,
      [session.id]
    );
  } catch { /* column may not exist */ }

  c.header("set-cookie", buildSessionCookie(session.id, sessionTtlSeconds));

  // Set trust cookie if requested
  if (trustDevice) {
    const trustExpiry = Date.now() + MFA_TRUST_TTL_DAYS * 24 * 60 * 60 * 1000;
    const trustPayload = Buffer.from(JSON.stringify({ uid: userId, exp: trustExpiry })).toString("base64");
    const trustCookie = `${MFA_TRUST_COOKIE_NAME}=${trustPayload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MFA_TRUST_TTL_DAYS * 24 * 60 * 60}`;
    c.header("set-cookie", trustCookie, { append: true });
  }

  const user = await database.findUserById(userId);

  emitAuditEvent({
    eventType: "AUDIT_EVENT_TYPE_MFA_VERIFIED",
    sourceService: "gateway-api",
    userId,
    severity: "RISK_SEVERITY_LOW",
    summary: `MFA verification successful for user ${userId}`,
    payload: { trustDevice },
  });

  return c.json({
    ok: true,
    authenticated: true,
    mfaVerified: true,
    user: user ? { id: user.id, username: user.username, email: user.email } : null,
  });
}
