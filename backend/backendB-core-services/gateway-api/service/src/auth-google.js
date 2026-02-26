import { createPublicKey, createVerify } from "node:crypto";
import { googleClientId } from "./config.js";
let googleCertsCache = null;
async function getGooglePublicKeys() {
    if (googleCertsCache && Date.now() < googleCertsCache.expiresAt) {
        return googleCertsCache.keys;
    }
    const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!res.ok)
        throw new Error("Failed to fetch Google public keys");
    const jwks = (await res.json());
    const keys = {};
    for (const jwk of jwks.keys) {
        const pubKey = createPublicKey({ key: jwk, format: "jwk" });
        keys[jwk.kid] = pubKey.export({ type: "spki", format: "pem" });
    }
    googleCertsCache = { keys, expiresAt: Date.now() + 3600_000 };
    return keys;
}
function decodeJwtPart(part) {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}
export async function verifyGoogleJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3)
        throw new Error("Invalid JWT format");
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
        throw new Error("Invalid issuer");
    }
    if (payload.aud !== googleClientId) {
        throw new Error("Invalid audience");
    }
    if (!payload.exp || payload.exp * 1000 < Date.now()) {
        throw new Error("Token expired");
    }
    if (!payload.email) {
        throw new Error("No email in token");
    }
    const keys = await getGooglePublicKeys();
    const kid = header.kid;
    if (!kid || !keys[kid]) {
        throw new Error("Unknown signing key");
    }
    const signatureInput = parts[0] + "." + parts[1];
    const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signatureInput);
    if (!verifier.verify(keys[kid], signature)) {
        throw new Error("Invalid signature");
    }
    return { email: payload.email, name: payload.name || "" };
}
//# sourceMappingURL=auth-google.js.map