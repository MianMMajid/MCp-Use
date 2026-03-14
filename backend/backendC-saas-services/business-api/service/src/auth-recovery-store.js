import { createHash, randomBytes, randomUUID } from "node:crypto";

const TOKEN_KIND_PASSWORD_RESET = "password_reset";
const TOKEN_KIND_VERIFY_EMAIL = "verify_email";

const DEFAULT_PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const DEFAULT_VERIFY_EMAIL_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_TOKEN_BYTES = 24;

function parsePositiveInt(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function nowIso(now) {
  return now().toISOString();
}

function expiresIso(now, ttlSeconds) {
  const expiresAt = new Date(now().getTime() + ttlSeconds * 1000);
  return expiresAt.toISOString();
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function hasPool(database) {
  return Boolean(database && typeof database.pool?.query === "function");
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toTokenRecord(row) {
  return {
    id: row.id,
    kind: row.token_kind,
    userId: row.user_id,
    email: row.email,
    redirectUrl: row.redirect_url ?? "",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export class AuthRecoveryStore {
  constructor(options = {}) {
    this.database = options.database;
    this.now = typeof options.now === "function" ? options.now : () => new Date();
    this.passwordResetTtlSeconds = parsePositiveInt(
      options.passwordResetTtlSeconds ??
        process.env.MAPLE_AUTH_RECOVERY_PASSWORD_RESET_TTL_SECONDS,
      DEFAULT_PASSWORD_RESET_TTL_SECONDS,
      60,
      7 * 24 * 60 * 60
    );
    this.verifyEmailTtlSeconds = parsePositiveInt(
      options.verifyEmailTtlSeconds ??
        process.env.MAPLE_AUTH_RECOVERY_VERIFY_EMAIL_TTL_SECONDS,
      DEFAULT_VERIFY_EMAIL_TTL_SECONDS,
      60,
      30 * 24 * 60 * 60
    );
    this.tokenBytes = parsePositiveInt(
      options.tokenBytes ?? process.env.MAPLE_AUTH_RECOVERY_TOKEN_BYTES,
      DEFAULT_TOKEN_BYTES,
      16,
      64
    );
    this.tokens = new Map();
    this.emailVerifications = new Map();
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    if (hasPool(this.database)) {
      await this.database.pool.query(`
        CREATE TABLE IF NOT EXISTS auth_recovery_tokens (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          token_kind TEXT NOT NULL,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          redirect_url TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_auth_recovery_tokens_kind_expires
          ON auth_recovery_tokens(token_kind, expires_at DESC);
        CREATE INDEX IF NOT EXISTS idx_auth_recovery_tokens_user_kind
          ON auth_recovery_tokens(user_id, token_kind);

        CREATE TABLE IF NOT EXISTS auth_email_verifications (
          user_id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          verified_at TEXT NOT NULL
        );
      `);
    }
    this.initialized = true;
  }

  ttlSecondsForKind(kind) {
    if (kind === TOKEN_KIND_VERIFY_EMAIL) {
      return this.verifyEmailTtlSeconds;
    }
    return this.passwordResetTtlSeconds;
  }

  async issueToken(input) {
    await this.ensureInitialized();
    const kind = String(input.kind ?? "").trim();
    if (!kind) {
      throw new Error("Token kind is required.");
    }
    const userId = String(input.userId ?? "").trim();
    if (!userId) {
      throw new Error("userId is required.");
    }
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error("email is required.");
    }

    const ttlSeconds = parsePositiveInt(
      input.ttlSeconds,
      this.ttlSecondsForKind(kind),
      60,
      30 * 24 * 60 * 60
    );
    const token = randomBytes(this.tokenBytes).toString("base64url");
    const tokenHash = hashToken(token);
    const createdAt = nowIso(this.now);
    const expiresAt = expiresIso(this.now, ttlSeconds);
    const redirectUrl = String(input.redirectUrl ?? "").trim();
    const id = randomUUID();

    if (hasPool(this.database)) {
      await this.database.pool.query(
        `INSERT INTO auth_recovery_tokens (
          id,
          token_hash,
          token_kind,
          user_id,
          email,
          redirect_url,
          created_at,
          expires_at,
          consumed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)`,
        [id, tokenHash, kind, userId, email, redirectUrl || null, createdAt, expiresAt]
      );
    } else {
      this.tokens.set(tokenHash, {
        id,
        kind,
        userId,
        email,
        redirectUrl,
        createdAt,
        expiresAt,
        consumedAt: null,
      });
    }

    return {
      token,
      kind,
      userId,
      email,
      redirectUrl,
      createdAt,
      expiresAt,
      ttlSeconds,
    };
  }

  async consumeToken(input) {
    await this.ensureInitialized();
    const kind = String(input.kind ?? "").trim();
    const token = String(input.token ?? "").trim();
    if (!kind || !token) {
      return null;
    }
    const tokenHash = hashToken(token);
    const consumedAt = nowIso(this.now);

    if (hasPool(this.database)) {
      const result = await this.database.pool.query(
        `
          WITH selected AS (
            SELECT id
            FROM auth_recovery_tokens
            WHERE token_hash = $1
              AND token_kind = $2
              AND consumed_at IS NULL
              AND expires_at > $3
            LIMIT 1
          )
          UPDATE auth_recovery_tokens
          SET consumed_at = $3
          WHERE id IN (SELECT id FROM selected)
          RETURNING
            id,
            token_kind,
            user_id,
            email,
            redirect_url,
            created_at,
            expires_at
        `,
        [tokenHash, kind, consumedAt]
      );
      if (!result.rows[0]) {
        return null;
      }
      return toTokenRecord(result.rows[0]);
    }

    const existing = this.tokens.get(tokenHash);
    if (!existing || existing.kind !== kind || existing.consumedAt) {
      return null;
    }
    if (existing.expiresAt <= consumedAt) {
      return null;
    }
    existing.consumedAt = consumedAt;
    return {
      id: existing.id,
      kind: existing.kind,
      userId: existing.userId,
      email: existing.email,
      redirectUrl: existing.redirectUrl,
      createdAt: existing.createdAt,
      expiresAt: existing.expiresAt,
    };
  }

  async markEmailVerified(input) {
    await this.ensureInitialized();
    const userId = String(input.userId ?? "").trim();
    const email = normalizeEmail(input.email);
    if (!userId || !email) {
      return;
    }
    const verifiedAt = nowIso(this.now);

    if (hasPool(this.database)) {
      await this.database.pool.query(
        `
          INSERT INTO auth_email_verifications (user_id, email, verified_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            verified_at = EXCLUDED.verified_at
        `,
        [userId, email, verifiedAt]
      );
      return;
    }

    this.emailVerifications.set(userId, { email, verifiedAt });
  }

  async isEmailVerified(userId) {
    await this.ensureInitialized();
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return false;
    }

    if (hasPool(this.database)) {
      const result = await this.database.pool.query(
        `SELECT 1 FROM auth_email_verifications WHERE user_id = $1 LIMIT 1`,
        [normalizedUserId]
      );
      return Boolean(result.rows[0]);
    }

    return this.emailVerifications.has(normalizedUserId);
  }

  async revokeSessionsByUserId(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return;
    }

    if (typeof this.database?.revokeSessionsByUserId === "function") {
      await this.database.revokeSessionsByUserId(normalizedUserId);
      return;
    }

    if (hasPool(this.database)) {
      await this.database.pool.query(
        `UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL`,
        [nowIso(this.now), normalizedUserId]
      );
    }
  }
}

export const AuthRecoveryTokenKinds = {
  PASSWORD_RESET: TOKEN_KIND_PASSWORD_RESET,
  VERIFY_EMAIL: TOKEN_KIND_VERIFY_EMAIL,
};
