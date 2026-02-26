#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out[key] = "";
      continue;
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function readBase64(pathname) {
  return readFileSync(resolve(pathname)).toString("base64");
}

function getenv(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" ? value : fallback;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../../..");

function parseDotEnvFile(pathname) {
  const out = {};
  let text = "";
  try {
    text = readFileSync(pathname, "utf8");
  } catch {
    return out;
  }
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function hydrateProcessEnvFromFile(pathname) {
  const parsed = parseDotEnvFile(pathname);
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }
}

function normalizeRepoUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("git@github.com:")) {
    return value.replace("git@github.com:", "https://github.com/").replace(/\.git$/, "");
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      parsed.username = "";
      parsed.password = "";
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\.git$/, "");
    } catch {
      return value.replace(/\.git$/, "");
    }
  }
  return value.replace(/\.git$/, "");
}

function inferRepoUrl() {
  try {
    const raw = execSync("git remote get-url origin", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return normalizeRepoUrl(raw);
  } catch {
    return "";
  }
}

function resolveDefaultTlsPath(filename) {
  return resolve(__dirname, "certs", filename);
}

hydrateProcessEnvFromFile(resolve(repoRoot, ".env"));
hydrateProcessEnvFromFile(resolve(repoRoot, ".env.northflank"));

const args = parseArgs(process.argv);

const repoUrl = args["repo-url"] || getenv("MAPLE_NF_REPO_URL") || inferRepoUrl();
const repoBranch = args["repo-branch"] || getenv("MAPLE_NF_REPO_BRANCH", "main");
const tlsCertPath = args["tls-cert"] || getenv("MAPLE_NF_TLS_CERT", resolveDefaultTlsPath("tls.crt"));
const tlsKeyPath = args["tls-key"] || getenv("MAPLE_NF_TLS_KEY", resolveDefaultTlsPath("tls.key"));
const tlsCaPath = args["tls-ca"] || getenv("MAPLE_NF_TLS_CA", resolveDefaultTlsPath("ca.crt"));

if (!repoUrl || !tlsCertPath || !tlsKeyPath || !tlsCaPath) {
  console.error("Usage: node generate-args.mjs \\");
  console.error("  --repo-url <https://github.com/org/repo> \\");
  console.error("  --repo-branch <branch> \\");
  console.error("  --tls-cert <path/to/tls.crt> \\");
  console.error("  --tls-key <path/to/tls.key> \\");
  console.error("  --tls-ca <path/to/ca.crt> [--output northflank.arguments.json]");
  process.exit(1);
}

const outputPath = resolve(
  args.output || "backend/backendA-platform-infra/deploy/northflank/northflank.arguments.json"
);

const payload = {
  arguments: {
    repoUrl,
    repoBranch,
    tlsCertBase64: readBase64(tlsCertPath),
    tlsKeyBase64: readBase64(tlsKeyPath),
    tlsCaBase64: readBase64(tlsCaPath),

    mapleApiKey: getenv("MAPLE_API_KEY"),
    mapleApiKeys: getenv("MAPLE_API_KEYS"),
    mapleAdminPassword: getenv("MAPLE_ADMIN_PASSWORD"),
    mapleAdminApiKey: getenv("MAPLE_ADMIN_API_KEY"),
    mapleAdminApiKeys: getenv("MAPLE_ADMIN_API_KEYS"),
    openclawBridgeToken: getenv("OPENCLAW_BRIDGE_TOKEN"),
    openclawGatewayToken: getenv("OPENCLAW_GATEWAY_TOKEN"),
    googleClientId: getenv("GOOGLE_CLIENT_ID"),
    stripeSecretKey: getenv("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: getenv("STRIPE_WEBHOOK_SECRET"),
    stripePricePro: getenv("STRIPE_PRICE_PRO"),
    stripePriceTeam: getenv("STRIPE_PRICE_TEAM"),
    stripePriceEnterprise: getenv("STRIPE_PRICE_ENTERPRISE"),
    stripePublishableKey: getenv("STRIPE_PUBLISHABLE_KEY"),
    openaiApiKey: getenv("OPENAI_API_KEY"),
    anthropicApiKey: getenv("ANTHROPIC_API_KEY"),
    sendgridApiKey: getenv("SENDGRID_API_KEY"),
    resendApiKey: getenv("RESEND_API_KEY"),
    twilioAccountSid: getenv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: getenv("TWILIO_AUTH_TOKEN")
  }
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
