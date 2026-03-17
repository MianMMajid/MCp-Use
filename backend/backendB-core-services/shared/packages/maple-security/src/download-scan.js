import { createHash } from "node:crypto";

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

function defaultContentType(contentType, fallback = "application/octet-stream") {
  const normalized = String(contentType ?? "").trim();
  return normalized || fallback;
}

function sha256Hex(content) {
  return createHash("sha256").update(Buffer.from(content ?? Buffer.alloc(0))).digest("hex");
}

function localVerdictFromResult(localResult = {}) {
  if (toBoolean(localResult.quarantined)) {
    return "quarantined";
  }
  if (localResult.safe === false) {
    return "malicious";
  }
  return "safe";
}

function buildLocalReasons(localResult = {}) {
  const threats = normalizeStringArray(localResult.threats ?? localResult.threatsFound);
  const quarantineReason = String(localResult.quarantineReason ?? "").trim();
  return [...new Set([...threats, ...(quarantineReason ? [quarantineReason] : [])])];
}

function stageFromVerdict(status, verdict) {
  if (status === "pending") {
    return "analysis_pending";
  }
  if (verdict === "safe" || verdict === "malicious" || verdict === "quarantined") {
    return "final_verdict";
  }
  return "local_heuristic";
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { response, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function virustotalVerdictFromStats(stats = {}) {
  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  const harmless = Number(stats.harmless ?? 0);
  const undetected = Number(stats.undetected ?? 0);
  const reasons = [
    `VirusTotal malicious=${malicious}`,
    `VirusTotal suspicious=${suspicious}`,
    `VirusTotal harmless=${harmless}`,
    `VirusTotal undetected=${undetected}`,
  ];
  return {
    verdict: malicious > 0 || suspicious > 0 ? "malicious" : "safe",
    reasons,
    blocked: malicious > 0 || suspicious > 0,
  };
}

async function enrichWithVirusTotal(baseScan, options) {
  const apiKey = String(options.virustotalApiKey ?? "").trim();
  if (!apiKey) {
    return baseScan;
  }

  const baseUrl = String(options.virustotalApiUrl ?? "https://www.virustotal.com/api/v3").replace(/\/+$/g, "");
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 4000;
  const sha256 = baseScan.sha256;
  const headers = { "x-apikey": apiKey, accept: "application/json" };

  try {
    const lookup = await fetchJsonWithTimeout(`${baseUrl}/files/${encodeURIComponent(sha256)}`, { headers }, timeoutMs);
    if (lookup.response.ok) {
      const stats = lookup.json?.data?.attributes?.last_analysis_stats ?? {};
      const vt = virustotalVerdictFromStats(stats);
      const checkedAt = String(lookup.json?.data?.attributes?.last_analysis_date
        ? new Date(Number(lookup.json.data.attributes.last_analysis_date) * 1000).toISOString()
        : new Date().toISOString());
      return {
        ...baseScan,
        provider: "virustotal",
        stage: "reputation_enriched",
        status: "completed",
        verdict: vt.verdict,
        reasons: [...new Set([...baseScan.reasons, ...vt.reasons])],
        checkedAt,
        blocked: baseScan.blocked || vt.blocked,
        quarantined: baseScan.quarantined || vt.blocked,
      };
    }

    if (lookup.response.status === 404 && options.content && Buffer.from(options.content).length > 0) {
      const form = new FormData();
      const filename = String(options.filename ?? `scan-${sha256}`);
      const contentType = defaultContentType(options.contentType);
      form.append("file", new Blob([Buffer.from(options.content)], { type: contentType }), filename);
      const submit = await fetchJsonWithTimeout(`${baseUrl}/files`, { method: "POST", headers: { "x-apikey": apiKey }, body: form }, timeoutMs);
      if (submit.response.ok || submit.response.status === 202) {
        return {
          ...baseScan,
          provider: "virustotal",
          stage: "analysis_pending",
          status: "pending",
          verdict: baseScan.verdict === "safe" ? "pending" : baseScan.verdict,
          reasons: [...new Set([...baseScan.reasons, "VirusTotal analysis queued"])],
          checkedAt: new Date().toISOString(),
        };
      }
    }

    return {
      ...baseScan,
      provider: "virustotal",
      stage: "analysis_pending",
      status: "pending",
      reasons: [...new Set([...baseScan.reasons, `VirusTotal unavailable (${lookup.response.status})`])],
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...baseScan,
      provider: "virustotal",
      stage: "analysis_pending",
      status: "pending",
      reasons: [...new Set([...baseScan.reasons, `VirusTotal error: ${error instanceof Error ? error.message : String(error)}`])],
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function scanDownloadedContent(options = {}) {
  const content = Buffer.from(options.content ?? Buffer.alloc(0));
  const localResult = options.localResult ?? {};
  const baseScan = {
    provider: "local",
    stage: "local_heuristic",
    status: "completed",
    verdict: localVerdictFromResult(localResult),
    sha256: sha256Hex(content),
    contentType: defaultContentType(options.contentType),
    sizeBytes: content.length,
    reasons: buildLocalReasons(localResult),
    checkedAt: new Date().toISOString(),
    blocked: toBoolean(localResult.quarantined) || localResult.safe === false,
    quarantined: toBoolean(localResult.quarantined),
  };

  const provider = String(options.provider ?? "local").trim().toLowerCase();
  if (provider !== "virustotal") {
    return {
      ...baseScan,
      stage: stageFromVerdict(baseScan.status, baseScan.verdict),
    };
  }

  return enrichWithVirusTotal(baseScan, {
    ...options,
    content,
  });
}

export function buildLocalScanResult(options = {}) {
  const threats = normalizeStringArray(options.threats);
  const quarantined = toBoolean(options.quarantined, false);
  return {
    safe: !quarantined && threats.length === 0,
    threats,
    quarantineReason: String(options.quarantineReason ?? "").trim(),
    quarantined,
  };
}
