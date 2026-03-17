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

function mergeScan(baseScan, patch = {}) {
  return {
    ...baseScan,
    ...patch,
    reasons: [...new Set([...(baseScan.reasons ?? []), ...(patch.reasons ?? [])])],
  };
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
      return mergeScan(baseScan, {
        provider: "virustotal",
        stage: "reputation_enriched",
        status: "completed",
        verdict: vt.verdict,
        analysis: {
          reputation: {
            malicious: Number(stats.malicious ?? 0),
            suspicious: Number(stats.suspicious ?? 0),
            harmless: Number(stats.harmless ?? 0),
            undetected: Number(stats.undetected ?? 0),
          },
        },
        checkedAt,
        blocked: baseScan.blocked || vt.blocked,
        quarantined: baseScan.quarantined || vt.blocked,
      });
    }

    if (lookup.response.status === 404 && options.content && Buffer.from(options.content).length > 0) {
      const form = new FormData();
      const filename = String(options.filename ?? `scan-${sha256}`);
      const contentType = defaultContentType(options.contentType);
      form.append("file", new Blob([Buffer.from(options.content)], { type: contentType }), filename);
      const submit = await fetchJsonWithTimeout(`${baseUrl}/files`, { method: "POST", headers: { "x-apikey": apiKey }, body: form }, timeoutMs);
      if (submit.response.ok || submit.response.status === 202) {
        return mergeScan(baseScan, {
          provider: "virustotal",
          stage: "analysis_pending",
          status: "pending",
          verdict: baseScan.verdict === "safe" ? "pending" : baseScan.verdict,
          analysis: {
            reputation: {
              queued: true,
            },
          },
          reasons: ["VirusTotal analysis queued"],
          checkedAt: new Date().toISOString(),
        });
      }
    }

    return mergeScan(baseScan, {
      provider: "virustotal",
      stage: "analysis_pending",
      status: "pending",
      reasons: [`VirusTotal unavailable (${lookup.response.status})`],
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return mergeScan(baseScan, {
      provider: "virustotal",
      stage: "analysis_pending",
      status: "pending",
      reasons: [`VirusTotal error: ${error instanceof Error ? error.message : String(error)}`],
      checkedAt: new Date().toISOString(),
    });
  }
}

async function enrichWithSandbox(baseScan, options) {
  const provider = String(options.malwareSandboxProvider ?? "none").trim().toLowerCase();
  if (provider !== "http") {
    if (options.malwareSandboxRequired) {
      return mergeScan(baseScan, {
        stage: "analysis_pending",
        status: "pending",
        reasons: ["Sandbox analysis required but not configured"],
      });
    }
    return baseScan;
  }
  const baseUrl = String(options.malwareSandboxApiUrl ?? "").replace(/\/+$/g, "");
  if (!baseUrl) {
    return mergeScan(baseScan, {
      stage: options.malwareSandboxRequired ? "analysis_pending" : baseScan.stage,
      status: options.malwareSandboxRequired ? "pending" : baseScan.status,
      reasons: ["Sandbox analysis URL is not configured"],
    });
  }
  const token = String(options.malwareSandboxApiToken ?? "").trim();
  const timeoutMs = Number.isFinite(Number(options.malwareSandboxTimeoutMs)) ? Number(options.malwareSandboxTimeoutMs) : 5000;
  const body = {
    sha256: baseScan.sha256,
    filename: options.filename ?? "",
    contentType: baseScan.contentType,
    sizeBytes: baseScan.sizeBytes,
    contentBase64: options.content ? Buffer.from(options.content).toString("base64") : "",
  };
  try {
    const submit = await fetchJsonWithTimeout(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }, timeoutMs);
    if (submit.response.status === 202 || submit.json?.status === "pending") {
      return mergeScan(baseScan, {
        provider: baseScan.provider === "local" ? "sandbox" : baseScan.provider,
        stage: "analysis_pending",
        status: "pending",
        reasons: ["Sandbox analysis queued"],
        analysis: {
          ...(baseScan.analysis ?? {}),
          sandbox: {
            status: "pending",
            analysisId: String(submit.json?.analysisId ?? ""),
          },
        },
      });
    }
    if (submit.response.ok) {
      const verdict = String(submit.json?.verdict ?? "").trim().toLowerCase() || baseScan.verdict;
      const malicious = verdict === "malicious";
      const quarantined = verdict === "quarantined";
      return mergeScan(baseScan, {
        provider: baseScan.provider === "local" ? "sandbox" : baseScan.provider,
        stage: "sandbox_complete",
        status: "completed",
        verdict,
        blocked: baseScan.blocked || malicious || quarantined,
        quarantined: baseScan.quarantined || quarantined || malicious,
        reasons: Array.isArray(submit.json?.reasons) ? submit.json.reasons : ["Sandbox analysis completed"],
        analysis: {
          ...(baseScan.analysis ?? {}),
          sandbox: {
            status: "completed",
            analysisId: String(submit.json?.analysisId ?? ""),
            score: Number(submit.json?.score ?? 0),
          },
        },
      });
    }
    return mergeScan(baseScan, {
      stage: options.malwareSandboxRequired ? "analysis_pending" : baseScan.stage,
      status: options.malwareSandboxRequired ? "pending" : baseScan.status,
      reasons: [`Sandbox unavailable (${submit.response.status})`],
    });
  } catch (error) {
    return mergeScan(baseScan, {
      stage: options.malwareSandboxRequired ? "analysis_pending" : baseScan.stage,
      status: options.malwareSandboxRequired ? "pending" : baseScan.status,
      reasons: [`Sandbox error: ${error instanceof Error ? error.message : String(error)}`],
    });
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
    analysis: {},
  };

  const provider = String(options.provider ?? "local").trim().toLowerCase();
  if (provider !== "virustotal") {
    const localOnly = {
      ...baseScan,
      stage: stageFromVerdict(baseScan.status, baseScan.verdict),
    };
    const sandboxed = await enrichWithSandbox(localOnly, options);
    return {
      ...sandboxed,
      stage: sandboxed.status === "pending" ? "analysis_pending" : (sandboxed.stage === "sandbox_complete" ? "final_verdict" : sandboxed.stage),
    };
  }

  const vt = await enrichWithVirusTotal(baseScan, {
    ...options,
    content,
  });
  const sandboxed = await enrichWithSandbox(vt, {
    ...options,
    content,
  });
  return {
    ...sandboxed,
    stage: sandboxed.status === "pending"
      ? "analysis_pending"
      : sandboxed.stage === "sandbox_complete" || sandboxed.stage === "reputation_enriched"
        ? "final_verdict"
        : sandboxed.stage,
  };
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
