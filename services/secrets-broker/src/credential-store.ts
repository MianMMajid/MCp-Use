import { randomUUID, randomBytes } from "node:crypto";

export interface Credential {
  credentialId: string;
  toolName: string;
  appId: string;
  scopes: string[];
  issuedAt: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
  issuedBy: string;
  token: string;
}

export class CredentialStore {
  private credentials = new Map<string, Credential>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.expireStale(), 30_000);
  }

  mint(toolName: string, appId: string, scopes: string[], ttlSeconds: number, issuedBy: string): Credential {
    const now = new Date();
    const credential: Credential = {
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

  revoke(credentialId: string): boolean {
    const cred = this.credentials.get(credentialId);
    if (!cred || cred.status !== "active") return false;
    cred.status = "revoked";
    return true;
  }

  get(credentialId: string): Credential | undefined {
    const cred = this.credentials.get(credentialId);
    if (cred && cred.status === "active" && new Date(cred.expiresAt) <= new Date()) {
      cred.status = "expired";
    }
    return cred;
  }

  listActive(appId?: string, toolName?: string): Credential[] {
    const now = new Date();
    const active: Credential[] = [];
    for (const cred of this.credentials.values()) {
      if (cred.status !== "active") continue;
      if (new Date(cred.expiresAt) <= now) { cred.status = "expired"; continue; }
      if (appId && cred.appId !== appId) continue;
      if (toolName && cred.toolName !== toolName) continue;
      active.push(cred);
    }
    return active;
  }

  private expireStale(): void {
    const now = new Date();
    for (const cred of this.credentials.values()) {
      if (cred.status === "active" && new Date(cred.expiresAt) <= now) {
        cred.status = "expired";
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
