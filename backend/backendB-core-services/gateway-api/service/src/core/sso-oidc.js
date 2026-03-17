/**
 * sso-oidc.js
 *
 * OIDC Authorization Code flow implementation using only node:crypto.
 * Handles authorization URL construction, token exchange, ID token
 * verification (via JWKS), and JWKS caching.
 */
import { createVerify, createHash } from "node:crypto";

// ── JWKS Cache ───────────────────────────────────────────────────────────────

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * @type {Map<string, { jwks: object, fetchedAt: number }>}
 */
const jwksCache = new Map();

// ── Base64URL Helpers ────────────────────────────────────────────────────────

function base64UrlDecode(value) {
  const normalized = String(value ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// ── JWT Parsing ──────────────────────────────────────────────────────────────

/**
 * Decode a JWT without verification. Returns { header, payload, signature, signedContent }.
 */
function decodeJwt(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT: expected 3 dot-separated segments.");
  }

  const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  const signature = base64UrlDecode(parts[2]);
  const signedContent = `${parts[0]}.${parts[1]}`;

  return { header, payload, signature, signedContent };
}

// ── RSA Key Construction ─────────────────────────────────────────────────────

/**
 * Build a PEM-encoded RSA public key from JWK (n, e) parameters.
 * Uses DER encoding for PKCS#1 RSAPublicKey wrapped in SubjectPublicKeyInfo.
 */
function jwkRsaToPem(n, e) {
  const modulusBytes = base64UrlDecode(n);
  const exponentBytes = base64UrlDecode(e);

  // Ensure leading zero byte for positive integers if high bit is set
  const modulus = modulusBytes[0] >= 0x80
    ? Buffer.concat([Buffer.from([0x00]), modulusBytes])
    : modulusBytes;
  const exponent = exponentBytes[0] >= 0x80
    ? Buffer.concat([Buffer.from([0x00]), exponentBytes])
    : exponentBytes;

  // DER-encode the RSA public key (PKCS#1 format)
  const modulusSeq = derInteger(modulus);
  const exponentSeq = derInteger(exponent);
  const rsaPublicKey = derSequence(Buffer.concat([modulusSeq, exponentSeq]));

  // Wrap in SubjectPublicKeyInfo
  // OID for rsaEncryption: 1.2.840.113549.1.1.1
  const rsaOid = Buffer.from([
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  ]);
  const nullParam = Buffer.from([0x05, 0x00]);
  const algorithmIdentifier = derSequence(Buffer.concat([rsaOid, nullParam]));

  // BitString wrapping (prepend 0x00 unused-bits byte)
  const bitString = derBitString(rsaPublicKey);

  const spki = derSequence(Buffer.concat([algorithmIdentifier, bitString]));

  // Encode to PEM
  const b64 = spki.toString("base64");
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x100) return Buffer.from([0x81, length]);
  if (length < 0x10000) return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  // For very large lengths (unlikely in practice)
  return Buffer.from([
    0x83,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ]);
}

function derSequence(content) {
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content]);
}

function derInteger(value) {
  return Buffer.concat([Buffer.from([0x02]), derLength(value.length), value]);
}

function derBitString(content) {
  // BitString: tag 0x03, length (content + 1 for unused-bits byte), 0x00 unused bits, content
  const innerLength = content.length + 1;
  return Buffer.concat([
    Buffer.from([0x03]),
    derLength(innerLength),
    Buffer.from([0x00]),
    content,
  ]);
}

// ── Algorithm Mapping ────────────────────────────────────────────────────────

function jwtAlgToNodeAlg(alg) {
  switch (alg) {
    case "RS256": return "RSA-SHA256";
    case "RS384": return "RSA-SHA384";
    case "RS512": return "RSA-SHA512";
    default:
      throw new Error(`Unsupported JWT algorithm: ${alg}. Only RS256/RS384/RS512 are supported.`);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an OIDC authorization URL for the Authorization Code flow.
 *
 * @param {{ clientId: string, redirectUri: string, scope: string, state: string, nonce: string, authorizationEndpoint: string }} params
 * @returns {string} Full authorization URL
 */
export function buildAuthorizationUrl({
  clientId,
  redirectUri,
  scope,
  state,
  nonce,
  authorizationEndpoint,
}) {
  if (!clientId) throw new Error("clientId is required.");
  if (!redirectUri) throw new Error("redirectUri is required.");
  if (!authorizationEndpoint) throw new Error("authorizationEndpoint is required.");

  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope || "openid email profile");
  if (state) url.searchParams.set("state", state);
  if (nonce) url.searchParams.set("nonce", nonce);

  return url.toString();
}

/**
 * Exchange an authorization code for tokens at the token endpoint.
 *
 * @param {{ code: string, clientId: string, clientSecret: string, redirectUri: string, tokenEndpoint: string }} params
 * @returns {Promise<{ accessToken: string, idToken: string, refreshToken?: string, tokenType: string, expiresIn?: number }>}
 */
export async function exchangeCodeForTokens({
  code,
  clientId,
  clientSecret,
  redirectUri,
  tokenEndpoint,
}) {
  if (!code) throw new Error("Authorization code is required.");
  if (!clientId) throw new Error("clientId is required.");
  if (!clientSecret) throw new Error("clientSecret is required.");
  if (!tokenEndpoint) throw new Error("tokenEndpoint is required.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri || "",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Token endpoint returned non-JSON response (${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const errorDesc = payload.error_description || payload.error || "unknown_error";
    throw new Error(`Token exchange failed (${response.status}): ${errorDesc}`);
  }

  if (!payload.access_token) {
    throw new Error("Token response did not include access_token.");
  }

  return {
    accessToken: payload.access_token,
    idToken: payload.id_token || "",
    refreshToken: payload.refresh_token || undefined,
    tokenType: payload.token_type || "Bearer",
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
  };
}

/**
 * Fetch JWKS from a URI with 1-hour caching.
 *
 * @param {string} jwksUri
 * @returns {Promise<{ keys: Array<object> }>}
 */
export async function fetchJwks(jwksUri) {
  if (!jwksUri) throw new Error("jwksUri is required.");

  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.jwks;
  }

  const response = await fetch(jwksUri, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri}: HTTP ${response.status}`);
  }

  const text = await response.text();
  let jwks;
  try {
    jwks = JSON.parse(text);
  } catch {
    throw new Error(`JWKS endpoint returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!jwks.keys || !Array.isArray(jwks.keys)) {
    throw new Error("JWKS response does not contain a 'keys' array.");
  }

  jwksCache.set(jwksUri, { jwks, fetchedAt: Date.now() });
  return jwks;
}

/**
 * Clear the JWKS cache (useful for testing or forced refresh).
 */
export function clearJwksCache() {
  jwksCache.clear();
}

/**
 * Verify an OIDC ID token.
 *
 * Fetches the JWKS, finds the matching key by kid, verifies the
 * RSA signature, and validates standard claims (iss, aud, exp, nonce).
 *
 * @param {{ idToken: string, jwksUri: string, clientId: string, nonce?: string, issuer?: string }} params
 * @returns {Promise<{ header: object, claims: object }>}
 */
export async function verifyIdToken({ idToken, jwksUri, clientId, nonce, issuer }) {
  if (!idToken) throw new Error("idToken is required.");
  if (!jwksUri) throw new Error("jwksUri is required for ID token verification.");
  if (!clientId) throw new Error("clientId is required for ID token verification.");

  // Decode the JWT
  const { header, payload: claims, signature, signedContent } = decodeJwt(idToken);

  // Validate algorithm
  const alg = header.alg;
  if (!alg || !alg.startsWith("RS")) {
    throw new Error(`Unsupported ID token algorithm: ${alg}. Expected RS256/RS384/RS512.`);
  }

  // Fetch JWKS and find matching key
  const jwks = await fetchJwks(jwksUri);
  const kid = header.kid;

  let jwk;
  if (kid) {
    jwk = jwks.keys.find((k) => k.kid === kid && k.kty === "RSA" && (k.use === "sig" || !k.use));
  }
  if (!jwk) {
    // Fallback: find any RSA signing key matching the algorithm
    jwk = jwks.keys.find((k) => k.kty === "RSA" && (k.use === "sig" || !k.use));
  }
  if (!jwk) {
    throw new Error(`No suitable RSA signing key found in JWKS${kid ? ` for kid '${kid}'` : ""}.`);
  }
  if (!jwk.n || !jwk.e) {
    throw new Error("JWK is missing required RSA parameters (n, e).");
  }

  // Build the PEM public key and verify signature
  const pem = jwkRsaToPem(jwk.n, jwk.e);
  const nodeAlg = jwtAlgToNodeAlg(alg);

  const verifier = createVerify(nodeAlg);
  verifier.update(signedContent, "utf8");
  const valid = verifier.verify(pem, signature);

  if (!valid) {
    throw new Error("ID token signature verification failed.");
  }

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW_SECONDS = 120;

  // exp (expiration)
  if (claims.exp !== undefined) {
    if (typeof claims.exp !== "number" || now > claims.exp + CLOCK_SKEW_SECONDS) {
      throw new Error("ID token has expired.");
    }
  }

  // iat (issued at) — sanity check only, not strictly required
  if (claims.iat !== undefined && typeof claims.iat === "number") {
    if (claims.iat > now + CLOCK_SKEW_SECONDS) {
      throw new Error("ID token was issued in the future.");
    }
  }

  // nbf (not before)
  if (claims.nbf !== undefined && typeof claims.nbf === "number") {
    if (now < claims.nbf - CLOCK_SKEW_SECONDS) {
      throw new Error("ID token is not yet valid (nbf claim).");
    }
  }

  // aud (audience) — must contain our clientId
  if (claims.aud !== undefined) {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(clientId)) {
      throw new Error(`ID token audience '${claims.aud}' does not match clientId '${clientId}'.`);
    }
    // If multiple audiences, azp must match clientId
    if (audiences.length > 1 && claims.azp && claims.azp !== clientId) {
      throw new Error(`ID token azp '${claims.azp}' does not match clientId '${clientId}'.`);
    }
  }

  // iss (issuer) — validate if provided
  if (issuer && claims.iss !== issuer) {
    throw new Error(`ID token issuer '${claims.iss}' does not match expected issuer '${issuer}'.`);
  }

  // nonce — validate if provided (replay protection)
  if (nonce && claims.nonce !== nonce) {
    throw new Error("ID token nonce does not match. Possible replay attack.");
  }

  return { header, claims };
}
