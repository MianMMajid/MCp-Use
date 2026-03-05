import { mapleLog } from "../logging.js";
import {
  recoveryDeliveryRequired,
  recoveryEmailFrom,
  recoveryEmailProvider,
  recoveryEmailReplyTo,
  recoveryEmailSubjectPrefix,
  recoveryResendApiKey,
  recoveryResetBaseUrl,
  recoverySendgridApiKey,
  recoverySmsFrom,
  recoverySmsProvider,
  recoverySmsTo,
  recoveryVerifyBaseUrl,
  twilioAccountSid,
  twilioAuthToken,
} from "../config.js";

function withToken(urlValue, token) {
  if (!urlValue) {
    return null;
  }
  try {
    const url = new URL(urlValue);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return null;
  }
}

function defaultUrlForChannel(channel) {
  if (channel === "password_reset") {
    return recoveryResetBaseUrl;
  }
  if (channel === "verify_email") {
    return recoveryVerifyBaseUrl;
  }
  return null;
}

function channelSummary(channel) {
  if (channel === "password_reset") {
    return "password reset";
  }
  if (channel === "verify_email") {
    return "email verification";
  }
  return "account recovery";
}

function buildDeliveryLink(event) {
  const preferredUrl = withToken(event.redirectUrl, event.token);
  if (preferredUrl) {
    return preferredUrl;
  }
  return withToken(defaultUrlForChannel(event.channel), event.token);
}

function buildEmailContent(event) {
  const action = channelSummary(event.channel);
  const link = buildDeliveryLink(event);
  const subject = `${recoveryEmailSubjectPrefix} ${action}`;
  const intro =
    event.channel === "password_reset"
      ? "Use the link below to reset your Maple password."
      : "Use the link below to verify your Maple email address.";
  const expiresAtText = event.expiresAt ? `Token expires at: ${event.expiresAt}` : "";
  const linkText = link
    ? `Action link: ${link}`
    : `One-time token: ${event.token}`;
  const text = [intro, "", linkText, expiresAtText].filter(Boolean).join("\n");
  const html = [
    `<p>${intro}</p>`,
    link
      ? `<p><a href="${link}">Complete ${action}</a></p>`
      : `<p><strong>One-time token:</strong> ${event.token}</p>`,
    expiresAtText ? `<p>${expiresAtText}</p>` : "",
  ]
    .filter(Boolean)
    .join("");
  return { subject, text, html };
}

function buildSmsContent(event) {
  const action = channelSummary(event.channel);
  const link = buildDeliveryLink(event);
  const tokenText = link ? `Link: ${link}` : `Token: ${event.token}`;
  return `Maple ${action}. ${tokenText}`;
}

async function assertHttpResponse(response, providerName) {
  if (response.ok) {
    return;
  }
  let body = "";
  try {
    body = await response.text();
  } catch {
    body = "";
  }
  throw new Error(
    `${providerName} delivery failed (HTTP ${response.status}). ${body.slice(0, 400)}`
  );
}

async function sendWithSendgrid(fetchImpl, event) {
  const { subject, text, html } = buildEmailContent(event);
  const payload = {
    personalizations: [{ to: [{ email: event.email }] }],
    from: { email: recoveryEmailFrom },
    subject,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
  };
  if (recoveryEmailReplyTo) {
    payload.reply_to = { email: recoveryEmailReplyTo };
  }
  const response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${recoverySendgridApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  await assertHttpResponse(response, "SendGrid");
}

async function sendWithResend(fetchImpl, event) {
  const { subject, text, html } = buildEmailContent(event);
  const payload = {
    from: recoveryEmailFrom,
    to: [event.email],
    subject,
    text,
    html,
  };
  if (recoveryEmailReplyTo) {
    payload.reply_to = recoveryEmailReplyTo;
  }
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${recoveryResendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  await assertHttpResponse(response, "Resend");
}

async function sendWithTwilio(fetchImpl, event) {
  const body = new URLSearchParams({
    To: recoverySmsTo,
    From: recoverySmsFrom,
    Body: buildSmsContent(event),
  });
  const basicAuth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString(
    "base64"
  );
  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  await assertHttpResponse(response, "Twilio");
}

export function buildRecoveryDeliveryDiagnostics() {
  const checks = [];
  const hasEmailProvider = recoveryEmailProvider !== "none";
  const hasSmsProvider = recoverySmsProvider !== "none";

  checks.push({
    id: "recovery.email_provider",
    ok: !hasEmailProvider || Boolean(recoveryEmailFrom),
    reason: !hasEmailProvider || recoveryEmailFrom ? "ok" : "MAPLE_RECOVERY_EMAIL_FROM is missing.",
  });
  checks.push({
    id: "recovery.sendgrid_api_key",
    ok:
      recoveryEmailProvider !== "sendgrid" || Boolean(recoverySendgridApiKey),
    reason:
      recoveryEmailProvider !== "sendgrid" || recoverySendgridApiKey
        ? "ok"
        : "SENDGRID_API_KEY (or MAPLE_RECOVERY_SENDGRID_API_KEY) is missing.",
  });
  checks.push({
    id: "recovery.resend_api_key",
    ok: recoveryEmailProvider !== "resend" || Boolean(recoveryResendApiKey),
    reason:
      recoveryEmailProvider !== "resend" || recoveryResendApiKey
        ? "ok"
        : "RESEND_API_KEY (or MAPLE_RECOVERY_RESEND_API_KEY) is missing.",
  });
  checks.push({
    id: "recovery.twilio_account_sid",
    ok: recoverySmsProvider !== "twilio" || Boolean(twilioAccountSid),
    reason:
      recoverySmsProvider !== "twilio" || twilioAccountSid
        ? "ok"
        : "TWILIO_ACCOUNT_SID (or MAPLE_RECOVERY_TWILIO_ACCOUNT_SID) is missing.",
  });
  checks.push({
    id: "recovery.twilio_auth_token",
    ok: recoverySmsProvider !== "twilio" || Boolean(twilioAuthToken),
    reason:
      recoverySmsProvider !== "twilio" || twilioAuthToken
        ? "ok"
        : "TWILIO_AUTH_TOKEN (or MAPLE_RECOVERY_TWILIO_AUTH_TOKEN) is missing.",
  });
  checks.push({
    id: "recovery.sms_from",
    ok: recoverySmsProvider !== "twilio" || Boolean(recoverySmsFrom),
    reason:
      recoverySmsProvider !== "twilio" || recoverySmsFrom
        ? "ok"
        : "MAPLE_RECOVERY_SMS_FROM is missing.",
  });
  checks.push({
    id: "recovery.sms_to",
    ok: recoverySmsProvider !== "twilio" || Boolean(recoverySmsTo),
    reason:
      recoverySmsProvider !== "twilio" || recoverySmsTo
        ? "ok"
        : "MAPLE_RECOVERY_SMS_TO is missing.",
  });

  const hasAnyDeliveryChannel = hasEmailProvider || hasSmsProvider;
  const failures = checks.filter((check) => !check.ok);
  return {
    required: recoveryDeliveryRequired,
    hasAnyDeliveryChannel,
    ready: failures.length === 0 && (!recoveryDeliveryRequired || hasAnyDeliveryChannel),
    checks,
    failures,
    mode: {
      emailProvider: recoveryEmailProvider,
      smsProvider: recoverySmsProvider,
    },
  };
}

export function createRecoveryNotificationPublisher(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? mapleLog;
  const diagnostics = buildRecoveryDeliveryDiagnostics();

  if (!diagnostics.hasAnyDeliveryChannel) {
    if (diagnostics.required) {
      throw new Error(
        "Recovery delivery is required but no email or SMS provider is configured."
      );
    }
    log("warn", "business_api.recovery_delivery_disabled", {
      reason: "No recovery notification provider configured.",
    });
    return async () => {};
  }

  if (!diagnostics.ready) {
    const summary = diagnostics.failures.map((check) => check.reason).join("; ");
    if (diagnostics.required) {
      throw new Error(`Recovery delivery provider config invalid. ${summary}`);
    }
    log("warn", "business_api.recovery_delivery_partial", { summary });
  }

  return async (event) => {
    if (!event || typeof event !== "object") {
      return;
    }
    const failures = [];
    const sent = [];

    if (recoveryEmailProvider !== "none" && event.email) {
      try {
        if (recoveryEmailProvider === "sendgrid") {
          await sendWithSendgrid(fetchImpl, event);
        } else if (recoveryEmailProvider === "resend") {
          await sendWithResend(fetchImpl, event);
        }
        sent.push(`email:${recoveryEmailProvider}`);
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (recoverySmsProvider === "twilio" && recoverySmsTo) {
      try {
        await sendWithTwilio(fetchImpl, event);
        sent.push("sms:twilio");
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (failures.length > 0) {
      log("error", "business_api.recovery_delivery_failed", {
        channel: event.channel ?? "unknown",
        providers: sent,
        errors: failures,
      });
      if (recoveryDeliveryRequired) {
        throw new Error(`Recovery delivery failed. ${failures.join("; ")}`);
      }
      return;
    }

    if (sent.length > 0) {
      log("info", "business_api.recovery_delivery_sent", {
        channel: event.channel ?? "unknown",
        providers: sent,
      });
    }
  };
}
