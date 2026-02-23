/**
 * Prompt Injection / Jailbreak Detection Engine
 *
 * Detects prompt injection attempts across 5 categories:
 * - instruction_override: attempts to override system instructions
 * - role_confusion: attempts to change model persona/bypass safety
 * - encoding_evasion: base64, hex, unicode escape obfuscation
 * - delimiter_injection: markdown/XML/JSON structural injection
 * - payload_smuggling: zero-width chars, homoglyphs, RTL overrides
 */

export interface PromptInjectionPattern {
  name: string;
  category: PromptInjectionCategory;
  regex: RegExp;
  weight: number; // 0-1
  severity: "low" | "medium" | "high" | "critical";
}

export type PromptInjectionCategory =
  | "instruction_override"
  | "role_confusion"
  | "encoding_evasion"
  | "delimiter_injection"
  | "payload_smuggling";

export interface PromptInjectionMatch {
  pattern: string;
  category: PromptInjectionCategory;
  weight: number;
  severity: "low" | "medium" | "high" | "critical";
  matchedText: string;
}

export interface PromptInjectionResult {
  isInjection: boolean;
  confidence: number;
  matches: PromptInjectionMatch[];
  categories: PromptInjectionCategory[];
  normalizedInput: string;
}

const INJECTION_PATTERNS: PromptInjectionPattern[] = [
  // ── instruction_override ──────────────────────────────────────────────────
  {
    name: "ignore_previous_instructions",
    category: "instruction_override",
    regex: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directives)/i,
    weight: 0.95,
    severity: "critical",
  },
  {
    name: "new_instructions",
    category: "instruction_override",
    regex: /new\s+instructions?\s*:/i,
    weight: 0.85,
    severity: "high",
  },
  {
    name: "system_prompt_override",
    category: "instruction_override",
    regex: /system\s+prompt\s*:/i,
    weight: 0.9,
    severity: "critical",
  },
  {
    name: "you_are_now",
    category: "instruction_override",
    regex: /you\s+are\s+now\s+/i,
    weight: 0.8,
    severity: "high",
  },
  {
    name: "disregard_override",
    category: "instruction_override",
    regex: /(disregard|override|forget|bypass)\s+(all\s+)?(previous|prior|above|your|safety|original)\s+(instructions|rules|guidelines|constraints|restrictions)/i,
    weight: 0.95,
    severity: "critical",
  },

  // ── role_confusion ────────────────────────────────────────────────────────
  {
    name: "ai_without_restrictions",
    category: "role_confusion",
    regex: /ai\s+(without|with\s+no|free\s+from)\s+(restrictions|limits|constraints|rules|safety|filters)/i,
    weight: 0.9,
    severity: "critical",
  },
  {
    name: "pretend_you_are",
    category: "role_confusion",
    regex: /pretend\s+(you\s+are|to\s+be|you'?re)\s+/i,
    weight: 0.75,
    severity: "high",
  },
  {
    name: "dan_jailbreak",
    category: "role_confusion",
    regex: /\b(DAN|STAN|DUDE|AIM|KEVIN|JAILBREAK)\b.*\b(mode|persona|character|personality|roleplay)\b/i,
    weight: 0.95,
    severity: "critical",
  },
  {
    name: "hypothetical_bypass",
    category: "role_confusion",
    regex: /(hypothetically|in\s+a\s+fictional\s+world|for\s+educational\s+purposes|imagine\s+you\s+have\s+no\s+restrictions)/i,
    weight: 0.7,
    severity: "medium",
  },

  // ── encoding_evasion ──────────────────────────────────────────────────────
  {
    name: "base64_instruction",
    category: "encoding_evasion",
    regex: /(?:decode|base64|atob)\s*[\(:]?\s*[A-Za-z0-9+/=]{20,}/i,
    weight: 0.8,
    severity: "high",
  },
  {
    name: "hex_payload",
    category: "encoding_evasion",
    regex: /\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){4,}/,
    weight: 0.75,
    severity: "high",
  },
  {
    name: "unicode_escape_sequence",
    category: "encoding_evasion",
    regex: /\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){3,}/,
    weight: 0.7,
    severity: "medium",
  },

  // ── delimiter_injection ───────────────────────────────────────────────────
  {
    name: "markdown_system_block",
    category: "delimiter_injection",
    regex: /```\s*system\b/i,
    weight: 0.85,
    severity: "high",
  },
  {
    name: "xml_tag_injection",
    category: "delimiter_injection",
    regex: /<\s*(system|instructions|prompt|admin)\s*>/i,
    weight: 0.85,
    severity: "high",
  },
  {
    name: "json_role_injection",
    category: "delimiter_injection",
    regex: /[{'"]\s*role['"]\s*:\s*['"]\s*system\s*['"]/i,
    weight: 0.8,
    severity: "high",
  },

  // ── payload_smuggling ─────────────────────────────────────────────────────
  {
    name: "zero_width_characters",
    category: "payload_smuggling",
    regex: /[\u200B\u200C\u200D\uFEFF]{2,}/,
    weight: 0.7,
    severity: "medium",
  },
  {
    name: "homoglyph_attack",
    category: "payload_smuggling",
    regex: /[\u0410-\u044F\u0391-\u03C9].*[\u0041-\u005A\u0061-\u007A]/,
    weight: 0.6,
    severity: "medium",
  },
  {
    name: "rtl_override",
    category: "payload_smuggling",
    regex: /[\u202A-\u202E\u2066-\u2069]/,
    weight: 0.75,
    severity: "high",
  },
];

/**
 * Strip zero-width characters and RTL overrides before scanning,
 * to prevent adversaries from hiding injection tokens inside invisible chars.
 */
export function normalizeForDetection(text: string): string {
  return text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scan text for prompt injection / jailbreak patterns.
 *
 * Confidence = max(highest single weight, aggregate/1.5)
 * Threshold: >= 0.7 blocks, >= 0.4 logs
 */
export function detectPromptInjection(text: string): PromptInjectionResult {
  const normalized = normalizeForDetection(text);
  const matches: PromptInjectionMatch[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const match = regex.exec(normalized);
    if (match) {
      matches.push({
        pattern: pattern.name,
        category: pattern.category,
        weight: pattern.weight,
        severity: pattern.severity,
        matchedText: match[0].slice(0, 100),
      });
    }
    // Also scan the original text for payload_smuggling patterns
    if (pattern.category === "payload_smuggling") {
      const origRegex = new RegExp(pattern.regex.source, pattern.regex.flags);
      const origMatch = origRegex.exec(text);
      if (origMatch && !matches.some((m) => m.pattern === pattern.name)) {
        matches.push({
          pattern: pattern.name,
          category: pattern.category,
          weight: pattern.weight,
          severity: pattern.severity,
          matchedText: origMatch[0].slice(0, 100),
        });
      }
    }
  }

  const highestWeight = matches.length > 0
    ? Math.max(...matches.map((m) => m.weight))
    : 0;
  const aggregateWeight = matches.reduce((sum, m) => sum + m.weight, 0);
  const confidence = Math.min(1, Math.max(highestWeight, aggregateWeight / 1.5));

  const categories = [...new Set(matches.map((m) => m.category))];

  return {
    isInjection: confidence >= 0.7,
    confidence,
    matches,
    categories,
    normalizedInput: normalized,
  };
}
