const MAX_REDIRECT_URL_LENGTH = 2048;
const MIN_TOKEN_LENGTH = 16;
const MIN_PASSWORD_LENGTH = 8;

function asTrimmedString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeEmail(value) {
  return asTrimmedString(value).toLowerCase();
}

function isLikelyEmail(value) {
  const candidate = normalizeEmail(value);
  if (!candidate) {
    return false;
  }
  // Intentional lightweight check; authoritative validation stays at provider/identity layer.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
}

function isSafeRedirectUrl(value) {
  const candidate = asTrimmedString(value);
  if (!candidate) {
    return false;
  }
  if (candidate.length > MAX_REDIRECT_URL_LENGTH) {
    return false;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:") {
      return true;
    }
    if (parsed.protocol !== "http:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function fail(error) {
  return { ok: false, error };
}

function pass(value) {
  return { ok: true, value };
}

export function parseForgotPasswordRequest(body) {
  const email = normalizeEmail(body?.email);
  const redirectUrl = asTrimmedString(body?.redirectUrl);

  if (!isLikelyEmail(email)) {
    return fail("email is required and must be valid.");
  }
  if (!isSafeRedirectUrl(redirectUrl)) {
    return fail("redirectUrl is required and must be a valid redirect URL.");
  }

  return pass({ email, redirectUrl });
}

export function parseResetPasswordRequest(body) {
  const token = asTrimmedString(body?.token);
  const newPassword = asTrimmedString(body?.newPassword);

  if (!token || token.length < MIN_TOKEN_LENGTH) {
    return fail(`token is required and must be at least ${MIN_TOKEN_LENGTH} chars.`);
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return fail(`newPassword must be at least ${MIN_PASSWORD_LENGTH} chars.`);
  }

  return pass({ token, newPassword });
}

export function parseVerifyEmailRequest(body) {
  const email = normalizeEmail(body?.email);
  if (!isLikelyEmail(email)) {
    return fail("email is required and must be valid.");
  }
  return pass({ email });
}

export function parseVerifyEmailConfirmRequest(body) {
  const token = asTrimmedString(body?.token);
  if (!token || token.length < MIN_TOKEN_LENGTH) {
    return fail(`token is required and must be at least ${MIN_TOKEN_LENGTH} chars.`);
  }
  return pass({ token });
}

export const AuthRecoveryContract = {
  MIN_PASSWORD_LENGTH,
  MIN_TOKEN_LENGTH,
  MAX_REDIRECT_URL_LENGTH,
};
