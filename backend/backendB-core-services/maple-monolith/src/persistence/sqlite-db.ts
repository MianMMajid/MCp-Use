import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { SharedTrace, Trace } from "../core/types.js";

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

function parsePayload<T>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed as T;
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

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export class MapleSqliteDatabase {
  private db: Database.Database;

  constructor(dbPath = process.env.MAPLE_DB_PATH ?? "data/maple.db") {
    const resolvedPath = resolve(process.cwd(), dbPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.runMigrations();
  }

  private runMigrations() {
    this.db.exec(`
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
    `);
  }

  loadTraces(limit = 5000): Trace[] {
    const rows = this.db
      .prepare(
        `SELECT data_json
         FROM traces
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as StoredPayloadRow[];

    const traces: Trace[] = [];
    for (const row of rows) {
      const parsed = parsePayload<Trace>(row.data_json);
      if (parsed) {
        traces.push(parsed);
      }
    }
    return traces;
  }

  upsertTrace(trace: Trace): void {
    this.db
      .prepare(
        `INSERT INTO traces (id, owner_key_fingerprint, session_id, updated_at, data_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_key_fingerprint = excluded.owner_key_fingerprint,
           session_id = excluded.session_id,
           updated_at = excluded.updated_at,
           data_json = excluded.data_json`
      )
      .run(
        trace.id,
        trace.ownerKeyFingerprint ?? null,
        trace.sessionId,
        trace.updatedAt,
        JSON.stringify(trace)
      );
  }

  removeTrace(traceId: string): void {
    this.db.prepare(`DELETE FROM traces WHERE id = ?`).run(traceId);
  }

  loadSharedTraces(limit = 5000): SharedTrace[] {
    const rows = this.db
      .prepare(
        `SELECT data_json
         FROM shared_traces
         ORDER BY shared_at DESC
         LIMIT ?`
      )
      .all(limit) as StoredPayloadRow[];

    const traces: SharedTrace[] = [];
    for (const row of rows) {
      const parsed = parsePayload<SharedTrace>(row.data_json);
      if (parsed) {
        traces.push(parsed);
      }
    }
    return traces;
  }

  upsertSharedTrace(trace: SharedTrace): void {
    this.db
      .prepare(
        `INSERT INTO shared_traces (id, shared_at, behavior_signature, risk_score, data_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           shared_at = excluded.shared_at,
           behavior_signature = excluded.behavior_signature,
           risk_score = excluded.risk_score,
           data_json = excluded.data_json`
      )
      .run(
        trace.id,
        trace.sharedAt,
        trace.behaviorSignature,
        Math.trunc(trace.riskScore),
        JSON.stringify(trace)
      );
  }

  removeSharedTrace(traceId: string): void {
    this.db.prepare(`DELETE FROM shared_traces WHERE id = ?`).run(traceId);
  }

  countUsers(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number };
    return Number(row?.count ?? 0);
  }

  createUser(input: CreateUserInput): MapleUser {
    const now = new Date().toISOString();
    const username = input.username.trim();
    const normalizedUsername = normalizeUsername(username);
    if (!username) {
      throw new Error("Username is required.");
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO users (id, username, normalized_username, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        username,
        normalizedUsername,
        input.email?.trim() || null,
        input.passwordHash,
        now,
        now
      );

    return {
      id,
      username,
      email: input.email?.trim() || null,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
  }

  syncUserPasswordByUsername(input: SyncUserPasswordInput): MapleUser {
    const username = input.username.trim();
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      throw new Error("Username is required.");
    }

    const existing = this.findUserByUsername(username);
    if (!existing) {
      return this.createUser({
        username,
        email: input.email,
        passwordHash: input.passwordHash,
      });
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE users
         SET password_hash = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(input.passwordHash, now, existing.id);

    const refreshed = this.findUserById(existing.id);
    if (!refreshed) {
      throw new Error("Unable to refresh synced user.");
    }
    return refreshed;
  }

  findUserByUsername(username: string): MapleUser | undefined {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      return undefined;
    }
    const row = this.db
      .prepare(
        `SELECT id, username, email, password_hash, created_at, updated_at
         FROM users
         WHERE normalized_username = ?`
      )
      .get(normalized) as UserRow | undefined;

    if (!row) {
      return undefined;
    }
    return toUserRecord(row);
  }

  findUserByEmail(email: string): MapleUser | undefined {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      return undefined;
    }
    const row = this.db
      .prepare(
        `SELECT id, username, email, password_hash, created_at, updated_at
         FROM users
         WHERE LOWER(email) = ?`
      )
      .get(trimmed) as UserRow | undefined;

    if (!row) {
      return undefined;
    }
    return toUserRecord(row);
  }

  findUserById(userId: string): MapleUser | undefined {
    const row = this.db
      .prepare(
        `SELECT id, username, email, password_hash, created_at, updated_at
         FROM users
         WHERE id = ?`
      )
      .get(userId) as UserRow | undefined;
    if (!row) {
      return undefined;
    }
    return toUserRecord(row);
  }

  createSession(userId: string, ttlSeconds: number): MapleSession {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
    const sessionId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, NULL)`
      )
      .run(sessionId, userId, createdAt.toISOString(), expiresAt.toISOString());

    return {
      id: sessionId,
      userId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
    };
  }

  findActiveSession(sessionId: string, nowIso = new Date().toISOString()): MapleSessionWithUser | undefined {
    const row = this.db
      .prepare(
        `SELECT
           s.id,
           s.user_id,
           s.created_at,
           s.expires_at,
           s.revoked_at,
           u.username,
           u.email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > ?
         LIMIT 1`
      )
      .get(sessionId, nowIso) as SessionJoinRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      user: {
        id: row.user_id,
        username: row.username,
        email: row.email,
      },
    };
  }

  revokeSession(sessionId: string): void {
    this.db
      .prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE id = ?`
      )
      .run(new Date().toISOString(), sessionId);
  }

  purgeExpiredSessions(nowIso = new Date().toISOString()): number {
    const result = this.db
      .prepare(
        `DELETE FROM sessions
         WHERE expires_at <= ?
            OR revoked_at IS NOT NULL`
      )
      .run(nowIso);
    return Number(result.changes ?? 0);
  }
}
