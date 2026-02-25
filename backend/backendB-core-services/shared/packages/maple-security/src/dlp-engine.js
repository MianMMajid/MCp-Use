/**
 * DLP Engine (Data Loss Prevention) — PII/PHI Detection
 *
 * Detects sensitive data patterns:
 * - PII: SSN, email, US phone, international phone, IP address
 * - Financial: credit card (Luhn-validated)
 * - PHI: date of birth, medical record number, patient name (contextual)
 */
// ── Validators ────────────────────────────────────────────────────────────────
export function luhnValidate(cardStr) {
    const digits = cardStr.replace(/[\s-]/g, "");
    if (!/^\d{13,19}$/.test(digits))
        return false;
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9)
                n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }
    return sum % 10 === 0;
}
export function isValidIPv4(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4)
        return false;
    for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255 || String(num) !== part)
            return false;
    }
    return true;
}
// ── Patterns ──────────────────────────────────────────────────────────────────
const DLP_PATTERNS = [
    // PII
    {
        name: "ssn",
        category: "pii",
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
        severity: "critical",
        validator: (match) => {
            const parts = match.split("-");
            const area = parseInt(parts[0], 10);
            // SSN area numbers 000, 666, and 900-999 are invalid
            return area !== 0 && area !== 666 && area < 900;
        },
    },
    {
        name: "email",
        category: "pii",
        regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
        severity: "medium",
    },
    {
        name: "us_phone",
        category: "pii",
        regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        severity: "medium",
    },
    {
        name: "international_phone",
        category: "pii",
        regex: /\b\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
        severity: "medium",
    },
    {
        name: "ip_address",
        category: "pii",
        regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
        severity: "low",
        validator: (match) => isValidIPv4(match),
    },
    // Financial
    {
        name: "credit_card",
        category: "financial",
        regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        severity: "critical",
        validator: (match) => luhnValidate(match),
    },
    // PHI
    {
        name: "date_of_birth",
        category: "phi",
        regex: /\b(?:date\s+of\s+birth|DOB|d\.o\.b\.?)\s*[:=]?\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi,
        severity: "high",
    },
    {
        name: "medical_record_number",
        category: "phi",
        regex: /\b(?:MRN|medical\s+record\s+(?:number|no\.?|#))\s*[:=]?\s*[A-Z0-9]{4,12}\b/gi,
        severity: "critical",
    },
    {
        name: "patient_name",
        category: "phi",
        regex: /\b(?:patient\s+name|patient)\s*[:=]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g,
        severity: "high",
    },
];
// ── Scanning ──────────────────────────────────────────────────────────────────
/**
 * Scan text for PII/PHI/Financial data patterns.
 */
export function scanForPII(text) {
    const findings = [];
    for (const pattern of DLP_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
            const matchedText = match[0];
            if (pattern.validator && !pattern.validator(matchedText))
                continue;
            findings.push({
                pattern: pattern.name,
                category: pattern.category,
                severity: pattern.severity,
                matchedText,
                startIndex: match.index,
                endIndex: match.index + matchedText.length,
            });
        }
    }
    return deduplicateFindings(findings);
}
/**
 * Remove overlapping matches, keeping the highest severity finding.
 */
function deduplicateFindings(findings) {
    const severityOrder = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
    };
    // Sort by start index, then by severity descending
    const sorted = [...findings].sort((a, b) => {
        if (a.startIndex !== b.startIndex)
            return a.startIndex - b.startIndex;
        return severityOrder[b.severity] - severityOrder[a.severity];
    });
    const deduped = [];
    let lastEnd = -1;
    for (const finding of sorted) {
        if (finding.startIndex >= lastEnd) {
            deduped.push(finding);
            lastEnd = finding.endIndex;
        }
        else if (severityOrder[finding.severity] > severityOrder[deduped[deduped.length - 1].severity]) {
            // Replace the last finding with higher severity overlapping one
            deduped[deduped.length - 1] = finding;
            lastEnd = Math.max(lastEnd, finding.endIndex);
        }
    }
    return deduped;
}
// ── Redaction ─────────────────────────────────────────────────────────────────
/**
 * Redact PII/PHI findings from text, replacing with [CATEGORY:pattern_name].
 */
export function redactPII(text, findings) {
    if (findings.length === 0)
        return text;
    // Sort findings by startIndex descending so replacements don't shift indices
    const sorted = [...findings].sort((a, b) => b.startIndex - a.startIndex);
    let result = text;
    for (const finding of sorted) {
        const replacement = `[${finding.category.toUpperCase()}:${finding.pattern}]`;
        result = result.slice(0, finding.startIndex) + replacement + result.slice(finding.endIndex);
    }
    return result;
}
// ── Classification ────────────────────────────────────────────────────────────
/**
 * Classify the overall DLP severity from findings.
 * Escalates if 3+ findings are present.
 */
export function classifyDlpSeverity(findings) {
    if (findings.length === 0)
        return "low";
    const severityOrder = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
    };
    const maxSeverity = findings.reduce((max, f) => severityOrder[f.severity] > severityOrder[max] ? f.severity : max, "low");
    // Escalate if 3+ findings
    if (findings.length >= 3 && maxSeverity !== "critical") {
        const escalated = severityOrder[maxSeverity] + 1;
        const reversed = ["low", "medium", "high", "critical"];
        return reversed[Math.min(escalated, 3)];
    }
    return maxSeverity;
}
//# sourceMappingURL=dlp-engine.js.map