import { randomUUID } from "node:crypto";
import pg from "pg";

import type { SharedTrace, Trace } from "@maple/types";

const { Pool } = pg;

interface StoredPayloadRow {
  data_json: string;
}

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

interface SessionJoinRow {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  username: string;
  email: string | null;
}

export interface MapleUser {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MapleSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface MapleSessionWithUser extends MapleSession {
  user: {
    id: string;
    username: string;
    email: string | null;
  };
}

interface CreateUserInput {
  username: string;
  email?: string;
  passwordHash: string;
}

interface SyncUserPasswordInput {
  username: string;
  passwordHash: string;
  email?: string;
}

export interface MapleSubscription {
  id: string;
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

function parsePayload<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toUserRecord(row: UserRow): MapleUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSubscriptionRecord(row: SubscriptionRow): MapleSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    plan: row.plan,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export class MaplePostgresDatabase {
  private pool: pg.Pool;
  private initialized = false;

  constructor(connectionString?: string) {
    const connStr =
      connectionString ??
      process.env.DATABASE_URL ??
      process.env.MAPLE_DATABASE_URL ??
      "postgresql://localhost:5432/maple";

    this.pool = new Pool({
      connectionString: connStr,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: connStr.includes("railway.app") || connStr.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.runMigrations();
    this.initialized = true;
  }

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS traces (
          id TEXT PRIMARY KEY,
          owner_key_fingerprint TEXT,
          session_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_traces_owner_updated
          ON traces(owner_key_fingerprint, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_traces_session_updated
          ON traces(session_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS shared_traces (
          id TEXT PRIMARY KEY,
          shared_at TEXT NOT NULL,
          behavior_signature TEXT NOT NULL,
          risk_score INTEGER NOT NULL,
          data_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_shared_traces_shared_at
          ON shared_traces(shared_at DESC);

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          normalized_username TEXT NOT NULL UNIQUE,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user
          ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires
          ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          stripe_customer_id TEXT UNIQUE,
          stripe_subscription_id TEXT UNIQUE,
          plan TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'active',
          current_period_end TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS audit_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          source_service TEXT NOT NULL,
          trace_id TEXT,
          session_id TEXT,
          request_id TEXT,
          user_id TEXT,
          key_fingerprint TEXT,
          payload_json TEXT,
          severity TEXT,
          summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp
          ON audit_events(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_events_trace
          ON audit_events(trace_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_events_type
          ON audit_events(event_type, timestamp DESC);
      `);
    } finally {
      client.release();
    }
  }

  async loadTraces(limit = 5000): Promise<Trace[]> {
    const result = await this.pool.query<StoredPayloadRow>(
      `SELECT data_json FROM traces ORDER BY updated_at DESC LIMIT $1`,
      [limit]
    );
    const traces: Trace[] = [];
    for (const row of result.rows) {
      const parsed = parsePayload<Trace>(row.data_json);
      if (parsed) traces.push(parsed);
    }
    return traces;
  }

  async upsertTrace(trace: Trace): Promise<void> {
    await this.pool.query(
      `INSERT INTO traces (id, owner_key_fingerprint, session_id, updated_at, data_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         owner_key_fingerprint = EXCLUDED.owner_key_fingerprint,
         session_id = EXCLUDED.session_id,
         updated_at = EXCLUDED.updated_at,
         data_json = EXCLUDED.data_json`,
      [trace.id, trace.ownerKeyFingerprint ?? null, trace.sessionId, trace.updatedAt, JSON.stringify(trace)]
    );
  }

  async removeTrace(traceId: string): Promise<void> {
    await this.pool.query(`DELETE FROM traces WHERE id = $1`, [traceId]);
  }

  async loadSharedTraces(limit = 5000): Promise<SharedTrace[]> {
    const result = await this.pool.query<StoredPayloadRow>(
      `SELECT data_json FROM shared_traces ORDER BY shared_at DESC LIMIT $1`,
      [limit]
    );
    const traces: SharedTrace[] = [];
    for (const row of result.rows) {
      const parsed = parsePayload<SharedTrace>(row.data_json);
      if (parsed) traces.push(parsed);
    }
    return traces;
  }

  async upsertSharedTrace(trace: SharedTrace): Promise<void> {
    await this.pool.query(
      `INSERT INTO shared_traces (id, shared_at, behavior_signature, risk_score, data_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         shared_at = EXCLUDED.shared_at,
         behavior_signature = EXCLUDED.behavior_signature,
         risk_score = EXCLUDED.risk_score,
         data_json = EXCLUDED.data_json`,
      [trace.id, trace.sharedAt, trace.behaviorSignature, Math.trunc(trace.riskScore), JSON.stringify(trace)]
    );
  }

  async removeSharedTrace(traceId: string): Promise<void> {
    await this.pool.query(`DELETE FROM shared_traces WHERE id = $1`, [traceId]);
  }

  async countUsers(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`SELECT COUNT(*) as count FROM users`);
    return Number(result.rows[0]?.count ?? 0);
  }

  async createUser(input: CreateUserInput): Promise<MapleUser> {
    const now = new Date().toISOString();
    const username = input.username.trim();
    const normalizedUsername = normalizeUsername(username);
    if (!username) throw new Error("Username is required.");
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO users (id, username, normalized_username, email, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, username, normalizedUsername, input.email?.trim() || null, input.passwordHash, now, now]
    );
    return { id, username, email: input.email?.trim() || null, passwordHash: input.passwordHash, createdAt: now, updatedAt: now };
  }

  async syncUserPasswordByUsername(input: SyncUserPasswordInput): Promise<MapleUser> {
    const username = input.username.trim();
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) throw new Error("Username is required.");
    const existing = await this.findUserByUsername(username);
    if (!existing) return this.createUser({ username, email: input.email, passwordHash: input.passwordHash });
    const now = new Date().toISOString();
    await this.pool.query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [input.passwordHash, now, existing.id]);
    const refreshed = await this.findUserById(existing.id);
    if (!refreshed) throw new Error("Unable to refresh synced user.");
    return refreshed;
  }

  async findUserByUsername(username: string): Promise<MapleUser | undefined> {
    const normalized = normalizeUsername(username);
    if (!normalized) return undefined;
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE normalized_username = $1`,
      [normalized]
    );
    if (result.rows.length === 0) return undefined;
    return toUserRecord(result.rows[0]);
  }

  async findUserByEmail(email: string): Promise<MapleUser | undefined> {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return undefined;
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE LOWER(email) = $1`,
      [trimmed]
    );
    if (result.rows.length === 0) return undefined;
    return toUserRecord(result.rows[0]);
  }

  async findUserById(userId: string): Promise<MapleUser | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return undefined;
    return toUserRecord(result.rows[0]);
  }

  async createSession(userId: string, ttlSeconds: number): Promise<MapleSession> {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
    const sessionId = randomUUID();
    await this.pool.query(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at) VALUES ($1, $2, $3, $4, NULL)`,
      [sessionId, userId, createdAt.toISOString(), expiresAt.toISOString()]
    );
    return { id: sessionId, userId, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), revokedAt: null };
  }

  async findActiveSession(sessionId: string, nowIso = new Date().toISOString()): Promise<MapleSessionWithUser | undefined> {
    const result = await this.pool.query<SessionJoinRow>(
      `SELECT s.id, s.user_id, s.created_at, s.expires_at, s.revoked_at, u.username, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 LIMIT 1`,
      [sessionId, nowIso]
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      id: row.id, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at,
      user: { id: row.user_id, username: row.username, email: row.email },
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query(`UPDATE sessions SET revoked_at = $1 WHERE id = $2`, [new Date().toISOString(), sessionId]);
  }

  async purgeExpiredSessions(nowIso = new Date().toISOString()): Promise<number> {
    const result = await this.pool.query(`DELETE FROM sessions WHERE expires_at <= $1 OR revoked_at IS NOT NULL`, [nowIso]);
    return result.rowCount ?? 0;
  }

  async findSubscriptionByUserId(userId: string): Promise<MapleSubscription | undefined> {
    const result = await this.pool.query<SubscriptionRow>(`SELECT * FROM subscriptions WHERE user_id = $1`, [userId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return toSubscriptionRecord(row);
  }

  async findSubscriptionByStripeCustomerId(stripeCustomerId: string): Promise<MapleSubscription | undefined> {
    const result = await this.pool.query<SubscriptionRow>(`SELECT * FROM subscriptions WHERE stripe_customer_id = $1`, [stripeCustomerId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return toSubscriptionRecord(row);
  }

  async upsertSubscription(input: {
    userId: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    plan: string;
    status: string;
    currentPeriodEnd?: string | null;
  }): Promise<MapleSubscription> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const result = await this.pool.query<SubscriptionRow>(
      `INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
         stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
         plan = EXCLUDED.plan, status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end, updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [id, input.userId, input.stripeCustomerId ?? null, input.stripeSubscriptionId ?? null, input.plan, input.status, input.currentPeriodEnd ?? null, now]
    );
    return toSubscriptionRecord(result.rows[0]);
  }

  async ensureFreeSubscription(userId: string): Promise<MapleSubscription> {
    const existing = await this.findSubscriptionByUserId(userId);
    if (existing) return existing;
    return this.upsertSubscription({ userId, plan: "free", status: "active" });
  }

  async updatePasswordByUserId(userId: string, newPasswordHash: string): Promise<void> {
    await this.pool.query(`UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`, [newPasswordHash, new Date().toISOString(), userId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
