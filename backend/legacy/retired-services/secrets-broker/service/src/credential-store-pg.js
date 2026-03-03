import { randomUUID, randomBytes, createHash } from "node:crypto";
import { Pool } from "pg";
import { mapleLog } from "@maple/common";

function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

export class CredentialStorePg {
    pool = null;
    pgReady = false;
    cleanupInterval;

    async initialize(databaseUrl) {
        try {
            this.pool = new Pool({
                connectionString: databaseUrl,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });
            const client = await this.pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS credentials (
                        credential_id TEXT PRIMARY KEY,
                        tool_name TEXT NOT NULL,
                        app_id TEXT NOT NULL,
                        scopes_json TEXT DEFAULT '[]',
                        issued_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        status TEXT DEFAULT 'active',
                        issued_by TEXT DEFAULT '',
                        token_hash TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_credentials_status_expires ON credentials (status, expires_at);
                    CREATE INDEX IF NOT EXISTS idx_credentials_app_tool ON credentials (app_id, tool_name);
                `);
                this.pgReady = true;
                mapleLog("info", "credential_store_pg_initialized", {});
            } finally {
                client.release();
            }
        } catch (err) {
            mapleLog("error", "credential_store_pg_init_failed", { error: err.message });
            this.pgReady = false;
            throw err;
        }
        this.cleanupInterval = setInterval(() => this.expireStale(), 30_000);
    }

    async mint(toolName, appId, scopes, ttlSeconds, issuedBy) {
        const now = new Date();
        const token = randomBytes(32).toString("base64url");
        const credential = {
            credentialId: randomUUID(),
            toolName,
            appId,
            scopes,
            issuedAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
            status: "active",
            issuedBy,
            token,
        };
        const tokenHash = hashToken(token);
        await this.pool.query(
            `INSERT INTO credentials
                (credential_id, tool_name, app_id, scopes_json, issued_at, expires_at, status, issued_by, token_hash, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                credential.credentialId,
                credential.toolName,
                credential.appId,
                JSON.stringify(credential.scopes),
                credential.issuedAt,
                credential.expiresAt,
                credential.status,
                credential.issuedBy,
                tokenHash,
                now.toISOString(),
                now.toISOString(),
            ]
        );
        return credential;
    }

    async revoke(credentialId) {
        const now = new Date().toISOString();
        const result = await this.pool.query(
            `UPDATE credentials SET status = 'revoked', updated_at = $1 WHERE credential_id = $2 AND status = 'active'`,
            [now, credentialId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    async get(credentialId) {
        const result = await this.pool.query(
            `SELECT credential_id, tool_name, app_id, scopes_json, issued_at, expires_at, status, issued_by
             FROM credentials WHERE credential_id = $1`,
            [credentialId]
        );
        if (result.rows.length === 0) return undefined;
        const row = result.rows[0];
        const cred = rowToCredential(row);
        if (cred.status === "active" && new Date(cred.expiresAt) <= new Date()) {
            cred.status = "expired";
            await this.pool.query(
                `UPDATE credentials SET status = 'expired', updated_at = $1 WHERE credential_id = $2`,
                [new Date().toISOString(), credentialId]
            );
        }
        return cred;
    }

    async listActive(appId, toolName) {
        const conditions = ["status = 'active'", "expires_at > $1"];
        const params = [new Date().toISOString()];
        let idx = 2;
        if (appId) {
            conditions.push(`app_id = $${idx++}`);
            params.push(appId);
        }
        if (toolName) {
            conditions.push(`tool_name = $${idx++}`);
            params.push(toolName);
        }
        const result = await this.pool.query(
            `SELECT credential_id, tool_name, app_id, scopes_json, issued_at, expires_at, status, issued_by
             FROM credentials WHERE ${conditions.join(" AND ")}`,
            params
        );
        return result.rows.map(rowToCredential);
    }

    async expireStale() {
        try {
            const now = new Date().toISOString();
            await this.pool.query(
                `UPDATE credentials SET status = 'expired', updated_at = $1 WHERE status = 'active' AND expires_at < $2`,
                [now, now]
            );
        } catch (err) {
            mapleLog("warn", "credential_store_pg_expire_failed", { error: err.message });
        }
    }

    async destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.pgReady = false;
        }
    }
}

function rowToCredential(row) {
    let scopes = [];
    try {
        scopes = JSON.parse(row.scopes_json);
    } catch { /* empty */ }
    return {
        credentialId: row.credential_id,
        toolName: row.tool_name,
        appId: row.app_id,
        scopes,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        status: row.status,
        issuedBy: row.issued_by,
    };
}
