import { Pool } from "pg";
import { mapleLog } from "@maple/common";

export class PolicyStorePg {
    pool = null;
    pgReady = false;

    async initialize(databaseUrl) {
        try {
            this.pool = new Pool({
                connectionString: databaseUrl,
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });
            const client = await this.pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS context_wall_policies (
                        id TEXT PRIMARY KEY DEFAULT 'default',
                        rules_json TEXT NOT NULL,
                        version INTEGER DEFAULT 1,
                        created_at TEXT NOT NULL,
                        created_by TEXT DEFAULT 'system'
                    );
                `);
                this.pgReady = true;
                mapleLog("info", "policy_store_pg_initialized", {});
            } finally {
                client.release();
            }
        } catch (err) {
            mapleLog("error", "policy_store_pg_init_failed", { error: err.message });
            this.pgReady = false;
            throw err;
        }
    }

    async loadPolicy() {
        if (!this.pgReady || !this.pool) return null;
        const result = await this.pool.query(
            `SELECT rules_json, version, created_at, created_by FROM context_wall_policies ORDER BY version DESC LIMIT 1`
        );
        if (result.rows.length === 0) return null;
        const row = result.rows[0];
        try {
            return {
                rules: JSON.parse(row.rules_json),
                version: row.version,
                createdAt: row.created_at,
                createdBy: row.created_by,
            };
        } catch {
            mapleLog("warn", "policy_store_pg_parse_failed", {});
            return null;
        }
    }

    async savePolicy(rules, createdBy = "system") {
        if (!this.pgReady || !this.pool) {
            throw new Error("PolicyStorePg is not initialized");
        }
        const now = new Date().toISOString();
        // Get current max version
        const vResult = await this.pool.query(
            `SELECT COALESCE(MAX(version), 0) AS max_version FROM context_wall_policies`
        );
        const nextVersion = vResult.rows[0].max_version + 1;
        await this.pool.query(
            `INSERT INTO context_wall_policies (id, rules_json, version, created_at, created_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [`policy-v${nextVersion}`, JSON.stringify(rules), nextVersion, now, createdBy]
        );
        return { version: nextVersion, createdAt: now };
    }

    async destroy() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.pgReady = false;
        }
    }
}
