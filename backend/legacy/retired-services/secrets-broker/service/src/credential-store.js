import { randomUUID, randomBytes } from "node:crypto";
export class CredentialStore {
    credentials = new Map();
    cleanupInterval;
    constructor() {
        this.cleanupInterval = setInterval(() => this.expireStale(), 30_000);
    }
    mint(toolName, appId, scopes, ttlSeconds, issuedBy) {
        const now = new Date();
        const credential = {
            credentialId: randomUUID(),
            toolName,
            appId,
            scopes,
            issuedAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
            status: "active",
            issuedBy,
            token: randomBytes(32).toString("base64url"),
        };
        this.credentials.set(credential.credentialId, credential);
        return credential;
    }
    revoke(credentialId) {
        const cred = this.credentials.get(credentialId);
        if (!cred || cred.status !== "active")
            return false;
        cred.status = "revoked";
        return true;
    }
    get(credentialId) {
        const cred = this.credentials.get(credentialId);
        if (cred && cred.status === "active" && new Date(cred.expiresAt) <= new Date()) {
            cred.status = "expired";
        }
        return cred;
    }
    listActive(appId, toolName) {
        const now = new Date();
        const active = [];
        for (const cred of this.credentials.values()) {
            if (cred.status !== "active")
                continue;
            if (new Date(cred.expiresAt) <= now) {
                cred.status = "expired";
                continue;
            }
            if (appId && cred.appId !== appId)
                continue;
            if (toolName && cred.toolName !== toolName)
                continue;
            active.push(cred);
        }
        return active;
    }
    expireStale() {
        const now = new Date();
        for (const cred of this.credentials.values()) {
            if (cred.status === "active" && new Date(cred.expiresAt) <= now) {
                cred.status = "expired";
            }
        }
    }
    destroy() {
        clearInterval(this.cleanupInterval);
    }
}
//# sourceMappingURL=credential-store.js.map