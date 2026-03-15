import { isPrivateOrLocalHost } from "@maple/common";
import { lookup } from "node:dns/promises";
import { config } from "./config.js";
import { detectPromptInjection } from "../../../shared/packages/maple-security/src/prompt-injection.js";
const METADATA_IPS = ["169.254.169.254", "fd00:ec2::254"];
export async function checkUrl(url, allowedDomains, blockedDomains) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return { allowed: false, reason: "Invalid URL", isPrivateIp: false, resolvedIp: "", normalizedUrl: url };
    }
    const hostname = parsed.hostname;
    // Block metadata endpoints
    if (METADATA_IPS.includes(hostname)) {
        return { allowed: false, reason: "Cloud metadata endpoint blocked", isPrivateIp: true, resolvedIp: hostname, normalizedUrl: parsed.toString() };
    }
    // Check private/local
    if (isPrivateOrLocalHost(hostname)) {
        return { allowed: false, reason: "Private/local IP blocked", isPrivateIp: true, resolvedIp: hostname, normalizedUrl: parsed.toString() };
    }
    // Domain blocklist check
    if (blockedDomains.length > 0 && blockedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
        return { allowed: false, reason: "Domain on blocklist", isPrivateIp: false, resolvedIp: "", normalizedUrl: parsed.toString() };
    }
    // DNS pinning - resolve and re-check
    let resolvedIp = "";
    try {
        const result = await lookup(hostname);
        resolvedIp = result.address;
        if (isPrivateOrLocalHost(resolvedIp)) {
            return { allowed: false, reason: "DNS resolved to private IP (SSRF guard)", isPrivateIp: true, resolvedIp, normalizedUrl: parsed.toString() };
        }
        if (METADATA_IPS.includes(resolvedIp)) {
            return { allowed: false, reason: "DNS resolved to metadata IP", isPrivateIp: true, resolvedIp, normalizedUrl: parsed.toString() };
        }
    }
    catch (dnsErr) {
        // Fail-closed: if DNS resolution fails, block the request to prevent
        // SSRF bypass via unresolvable hostnames that may resolve differently
        // in downstream contexts.
        return { allowed: false, reason: `DNS resolution failed for ${hostname}: ${dnsErr.code || dnsErr.message}`, isPrivateIp: false, resolvedIp: "", normalizedUrl: parsed.toString() };
    }
    if (allowedDomains.length > 0 && !allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
        return { allowed: false, reason: "Domain not on allowlist", isPrivateIp: false, resolvedIp, normalizedUrl: parsed.toString() };
    }
    return { allowed: true, reason: "OK", isPrivateIp: false, resolvedIp, normalizedUrl: parsed.toString() };
}
// ── Download Quarantine ──────────────────────────────────────────────────────
/** Content-types that are always quarantined. */
const DANGEROUS_CONTENT_TYPES = [
    "application/x-msdownload",
    "application/x-executable",
    "application/x-sh",
    "application/java-archive",
    "application/x-dosexec",
    "application/x-msi",
    "application/x-msdos-program",
    "application/vnd.microsoft.portable-executable",
];
/** File extensions that are quarantined when inferred from source URL. */
const DANGEROUS_EXTENSIONS = new Set([
    ".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".scr", ".msi", ".jar", ".sh",
    ".com", ".pif", ".hta", ".cpl", ".inf", ".reg",
]);
/** Archive extensions that trigger quarantine. */
const ARCHIVE_EXTENSIONS = new Set([".zip", ".tar", ".gz", ".tgz", ".rar", ".7z", ".bz2", ".xz"]);
/** Magic byte signatures for executable/archive detection. */
const MAGIC_SIGNATURES = [
    { name: "PE executable (MZ)", bytes: [0x4d, 0x5a] },
    { name: "ELF executable", bytes: [0x7f, 0x45, 0x4c, 0x46] },
    { name: "Mach-O 64-bit", bytes: [0xcf, 0xfa, 0xed, 0xfe] },
    { name: "Mach-O 32-bit", bytes: [0xce, 0xfa, 0xed, 0xfe] },
    { name: "ZIP archive", bytes: [0x50, 0x4b, 0x03, 0x04] },
    { name: "GZIP archive", bytes: [0x1f, 0x8b] },
    { name: "RAR archive", bytes: [0x52, 0x61, 0x72, 0x21] },
    { name: "7z archive", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
    { name: "Java class file", bytes: [0xca, 0xfe, 0xba, 0xbe] },
];
function matchesMagicBytes(buf) {
    for (const sig of MAGIC_SIGNATURES) {
        const offset = sig.offset ?? 0;
        if (buf.length < offset + sig.bytes.length)
            continue;
        let match = true;
        for (let i = 0; i < sig.bytes.length; i++) {
            if (buf[offset + i] !== sig.bytes[i]) {
                match = false;
                break;
            }
        }
        if (match)
            return sig.name;
    }
    return null;
}
function getExtensionFromUrl(sourceUrl) {
    try {
        const pathname = new URL(sourceUrl).pathname;
        const lastDot = pathname.lastIndexOf(".");
        if (lastDot === -1)
            return "";
        return pathname.slice(lastDot).toLowerCase().split("?")[0];
    }
    catch {
        return "";
    }
}
/** Detect base64-encoded executable payloads in text content. */
function detectBase64Executable(text) {
    // Match base64 blocks (at least 64 chars)
    const base64Pattern = /[A-Za-z0-9+/]{64,}={0,2}/g;
    let match;
    while ((match = base64Pattern.exec(text)) !== null) {
        try {
            const decoded = Buffer.from(match[0].slice(0, 128), "base64");
            if (decoded.length >= 4) {
                const sig = matchesMagicBytes(decoded);
                if (sig)
                    return `Base64-encoded ${sig}`;
            }
        }
        catch {
            // Not valid base64
        }
    }
    return null;
}
/**
 * Scan response content for threats and quarantine dangerous downloads.
 *
 * @param content - Response body buffer
 * @param contentType - HTTP Content-Type header value
 * @param sourceUrl - Optional source URL for file extension inference
 */
export function scanContent(content, contentType, sourceUrl) {
    const threats = [];
    let quarantined = false;
    let quarantineReason;
    // ── Size limit ──
    if (config.quarantineEnabled && content.length > config.maxResponseBytes) {
        return {
            safe: false,
            threats: [`Content exceeds maximum size (${content.length} > ${config.maxResponseBytes} bytes)`],
            sanitized: Buffer.alloc(0),
            quarantined: true,
            quarantineReason: `Response body too large: ${content.length} bytes`,
        };
    }
    // ── Dangerous content-type ──
    if (config.quarantineEnabled) {
        const lowerCt = contentType.toLowerCase();
        for (const dangerousCt of DANGEROUS_CONTENT_TYPES) {
            if (lowerCt.includes(dangerousCt)) {
                return {
                    safe: false,
                    threats: [`Dangerous content-type: ${contentType}`],
                    sanitized: Buffer.alloc(0),
                    quarantined: true,
                    quarantineReason: `Blocked content-type: ${contentType}`,
                };
            }
        }
        // ── File extension from URL ──
        if (sourceUrl) {
            const ext = getExtensionFromUrl(sourceUrl);
            if (DANGEROUS_EXTENSIONS.has(ext)) {
                return {
                    safe: false,
                    threats: [`Dangerous file extension: ${ext}`],
                    sanitized: Buffer.alloc(0),
                    quarantined: true,
                    quarantineReason: `Blocked file extension: ${ext}`,
                };
            }
            if (ARCHIVE_EXTENSIONS.has(ext)) {
                quarantined = true;
                quarantineReason = `Archive quarantined: ${ext}`;
                threats.push(`Archive file: ${ext}`);
            }
        }
        // ── Magic bytes detection ──
        if (content.length >= 2) {
            const magicMatch = matchesMagicBytes(content);
            if (magicMatch) {
                // Executables are hard-blocked; archives are quarantined
                const isExecutable = magicMatch.includes("executable") || magicMatch.includes("class file");
                if (isExecutable) {
                    return {
                        safe: false,
                        threats: [`Magic bytes: ${magicMatch}`],
                        sanitized: Buffer.alloc(0),
                        quarantined: true,
                        quarantineReason: `Executable detected: ${magicMatch}`,
                    };
                }
                // Archive magic bytes
                if (!quarantined) {
                    quarantined = true;
                    quarantineReason = `Archive detected: ${magicMatch}`;
                    threats.push(`Archive magic bytes: ${magicMatch}`);
                }
            }
        }
        // ── ZIP bomb detection ──
        // If content claims to be a compressed archive, check the declared
        // uncompressed size against a safe ratio. ZIP local-file headers store
        // uncompressed size at offset 22 (4 bytes LE). A ratio > 100:1 is
        // suspicious for payloads arriving over HTTP.
        if (content.length >= 30 && content[0] === 0x50 && content[1] === 0x4b &&
            content[2] === 0x03 && content[3] === 0x04) {
            const uncompressedSize = content.readUInt32LE(22);
            const ZIP_BOMB_RATIO = 100;
            if (uncompressedSize > 0 && uncompressedSize > content.length * ZIP_BOMB_RATIO) {
                return {
                    safe: false,
                    threats: [`Suspected ZIP bomb: declared uncompressed size ${uncompressedSize} is ${Math.round(uncompressedSize / content.length)}x the compressed size`],
                    sanitized: Buffer.alloc(0),
                    quarantined: true,
                    quarantineReason: `ZIP bomb detected: compression ratio ${Math.round(uncompressedSize / content.length)}:1 exceeds ${ZIP_BOMB_RATIO}:1 limit`,
                };
            }
        }

        // ── Base64 executable detection in text content ──
        if (contentType.includes("text") || contentType.includes("json") || contentType.includes("xml")) {
            const text = content.toString("utf8");
            const b64Hit = detectBase64Executable(text);
            if (b64Hit) {
                return {
                    safe: false,
                    threats: [b64Hit],
                    sanitized: Buffer.alloc(0),
                    quarantined: true,
                    quarantineReason: b64Hit,
                };
            }
        }
    }
    // If quarantined (archive), return empty body
    if (quarantined) {
        return { safe: false, threats, sanitized: Buffer.alloc(0), quarantined, quarantineReason };
    }
    // ── XSS detection (existing) ──
    let text = content.toString("utf8");
    if (contentType.includes("html") || contentType.includes("text")) {
        const xssPatterns = [/<script[\s>]/i, /javascript:/i, /on\w+\s*=/i, /<iframe[\s>]/i, /<object[\s>]/i, /<embed[\s>]/i];
        for (const pattern of xssPatterns) {
            if (pattern.test(text)) {
                threats.push(`XSS pattern: ${pattern.source}`);
                text = text.replace(new RegExp(pattern.source, "gi"), "[sanitized]");
            }
        }
    }
    return { safe: threats.length === 0, threats, sanitized: Buffer.from(text), quarantined: false };
}
const TEXT_LIKE_TYPES = /^(text\/|application\/json|application\/xml|application\/xhtml|application\/.*markdown)/i;
/**
 * Scan fetched response content for indirect prompt injection patterns.
 * Fail-open: returns detection result but does not block.
 */
export function scanContentForInjection(content, contentType) {
    if (!content || !TEXT_LIKE_TYPES.test(contentType)) {
        return { hasInjection: false, confidence: 0, patterns: [], categories: [] };
    }
    const text = typeof content === "string" ? content : content.toString("utf8");
    const result = detectPromptInjection(text);
    return {
        hasInjection: result.isInjection,
        confidence: result.confidence,
        patterns: result.matches.map(m => m.pattern),
        categories: result.categories,
    };
}
//# sourceMappingURL=ssrf-guard.js.map