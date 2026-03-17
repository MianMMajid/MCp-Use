/**
 * mfa.js
 *
 * TOTP (RFC 6238) implementation using node:crypto.
 * Handles secret generation, QR code URI building, TOTP verification,
 * AES-256-GCM encryption for secret storage, and recovery code generation.
 */
import { createHmac, randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";

const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_WINDOW = 1; // Accept +/- 1 period (30s drift)
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 8;

// ── TOTP Core ───────────────────────────────────────────────────────────

/**
 * Generate a random TOTP secret (20 bytes, base32-encoded).
 * @returns {string} Base32-encoded secret
 */
export function generateTotpSecret() {
  const buffer = randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Build an otpauth:// URI for QR code generation.
 * @param {{ secret: string, issuer: string, accountName: string }} options
 * @returns {string}
 */
export function buildTotpUri({ secret, issuer = "Mayple", accountName }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Generate a TOTP code for the given secret and time.
 * @param {string} secret - Base32-encoded secret
 * @param {number} [time] - Unix timestamp in seconds (defaults to now)
 * @returns {string} 6-digit TOTP code
 */
export function generateTotpCode(secret, time) {
  const timeCounter = Math.floor((time ?? Math.floor(Date.now() / 1000)) / TOTP_PERIOD);
  return hotpCode(secret, timeCounter);
}

/**
 * Verify a TOTP code against the secret with clock drift tolerance.
 * @param {string} secret - Base32-encoded secret
 * @param {string} code - User-provided code
 * @param {number} [time] - Unix timestamp in seconds (defaults to now)
 * @returns {boolean}
 */
export function verifyTotpCode(secret, code, time) {
  if (!code || code.length !== TOTP_DIGITS) return false;

  const currentTime = time ?? Math.floor(Date.now() / 1000);
  const currentCounter = Math.floor(currentTime / TOTP_PERIOD);

  // Check current period and adjacent periods (clock drift tolerance)
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const expected = hotpCode(secret, currentCounter + offset);
    if (timingSafeEqual(code, expected)) {
      return true;
    }
  }

  return false;
}

/**
 * HOTP implementation (RFC 4226).
 */
function hotpCode(secret, counter) {
  const secretBytes = base32Decode(secret);

  // Counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", secretBytes);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

// ── Encryption ──────────────────────────────────────────────────────────

/**
 * Encrypt a TOTP secret using AES-256-GCM.
 * @param {string} plaintext - The secret to encrypt
 * @param {string} encryptionKey - 32-byte hex key (64 hex chars)
 * @returns {string} Base64-encoded "iv:authTag:ciphertext"
 */
export function encryptSecret(plaintext, encryptionKey) {
  const key = Buffer.from(encryptionKey, "hex");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");

  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted secret.
 * @param {string} encryptedPayload - "iv:authTag:ciphertext" in base64
 * @param {string} encryptionKey - 32-byte hex key
 * @returns {string} Decrypted plaintext
 */
export function decryptSecret(encryptedPayload, encryptionKey) {
  const key = Buffer.from(encryptionKey, "hex");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");

  const [ivB64, authTagB64, ciphertext] = encryptedPayload.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ── Recovery Codes ──────────────────────────────────────────────────────

/**
 * Generate a set of recovery codes.
 * @returns {string[]} Array of human-readable recovery codes
 */
export function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const bytes = randomBytes(Math.ceil(RECOVERY_CODE_LENGTH / 2));
    const code = bytes.toString("hex").slice(0, RECOVERY_CODE_LENGTH).toUpperCase();
    // Format: XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Hash a recovery code for storage.
 * @param {string} code
 * @returns {string}
 */
export function hashRecoveryCode(code) {
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Verify a recovery code against a hash.
 * @param {string} code
 * @param {string} hash
 * @returns {boolean}
 */
export function verifyRecoveryCode(code, hash) {
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  const computed = createHash("sha256").update(normalized).digest("hex");
  return timingSafeEqual(computed, hash);
}

// ── Base32 ──────────────────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(encoded) {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const char of cleaned) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// ── Timing-safe comparison ──────────────────────────────────────────────

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}
