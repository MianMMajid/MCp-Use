import type { FirewallChatContext } from "./firewall-chat-context.js";

export type FirewallChatAiProvider = "openai" | "anthropic";

export type FirewallChatRole = "user" | "assistant";

export interface FirewallChatTurn {
  role: FirewallChatRole;
  content: string;
}

interface CreateFirewallChatAiRuntimeDeps {
  asString: (value: unknown) => string | undefined;
  firewallChatAnthropicApiKey?: string;
  firewallChatAnthropicModel: string;
  firewallChatOpenAiApiKey?: string;
  firewallChatOpenAiModel: string;
  firewallChatPrimaryProvider: FirewallChatAiProvider;
  firewallChatTimeoutMs: number;
  truncateText: (value: string, maxLength?: number) => string;
  withAbortTimeout: <T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) => Promise<T>;
}

function parseChatTurnContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as Record<string, unknown>).type === "text" &&
          typeof (entry as Record<string, unknown>).text === "string"
        ) {
          return String((entry as Record<string, unknown>).text).trim();
        }
        return "";
      })
      .filter((item) => item.length > 0);
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
}

function buildFirewallChatSystemPrompt(context: FirewallChatContext): string {
  const contextSnapshot = {
    generatedAt: context.generatedAt,
    trace: context.trace,
    firewall: context.firewall,
    highlights: context.highlights,
    recommendations: context.recommendations,
  };

  return [
    "You are Maple Firewall Assistant for agent traces.",
    "Use only the provided context and chat history. Do not invent events, steps, rules, or tools.",
    "If data is missing in context, explicitly say it is unavailable.",
    "Keep answers concise and operational; reference concrete step indexes and rule labels when present.",
    "When recommending next actions, prioritize Maple-native controls like guard_action, /api/firewall/decision, audit_risk, and ml_anomaly_report.",
    "Context JSON:",
    JSON.stringify(contextSnapshot, null, 2),
  ].join("\n");
}

export function createFirewallChatAiRuntime(
  deps: CreateFirewallChatAiRuntimeDeps
): {
  normalizeFirewallChatHistory: (
    rawMessages: unknown,
    fallbackQuestion: string
  ) => FirewallChatTurn[];
  isNetworkActionQuery: (question: string) => boolean;
  firewallChatProviderOrder: () => FirewallChatAiProvider[];
  callOpenAiFirewallChat: (
    history: FirewallChatTurn[],
    context: FirewallChatContext
  ) => Promise<string>;
  callAnthropicFirewallChat: (
    history: FirewallChatTurn[],
    context: FirewallChatContext
  ) => Promise<string>;
} {
  const normalizeFirewallChatHistory = (
    rawMessages: unknown,
    fallbackQuestion: string
  ): FirewallChatTurn[] => {
    const normalized: FirewallChatTurn[] = [];
    if (Array.isArray(rawMessages)) {
      for (const candidate of rawMessages) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          continue;
        }
        const roleRaw = deps.asString((candidate as Record<string, unknown>).role);
        const role: FirewallChatRole | null =
          roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
        if (!role) {
          continue;
        }
        const content = parseChatTurnContent(
          (candidate as Record<string, unknown>).content
        );
        if (!content) {
          continue;
        }
        normalized.push({ role, content });
      }
    }

    const recent = normalized.slice(-16);
    if (recent.length === 0 || recent[recent.length - 1]?.role !== "user") {
      recent.push({ role: "user", content: fallbackQuestion });
    }
    return recent;
  };

  const isNetworkActionQuery = (question: string): boolean => {
    const normalized = question.trim().toLowerCase();
    return (
      /(network|web|http|https|url|request|fetch|download|upload)/.test(normalized) &&
      /(action|actions|occur|occurred|happen|happened|list|show|which|what)/.test(normalized)
    );
  };

  const firewallChatProviderOrder = (): FirewallChatAiProvider[] => {
    const ordered: FirewallChatAiProvider[] = [];
    if (deps.firewallChatPrimaryProvider === "anthropic") {
      if (deps.firewallChatAnthropicApiKey) {
        ordered.push("anthropic");
      }
      if (deps.firewallChatOpenAiApiKey) {
        ordered.push("openai");
      }
    } else {
      if (deps.firewallChatOpenAiApiKey) {
        ordered.push("openai");
      }
      if (deps.firewallChatAnthropicApiKey) {
        ordered.push("anthropic");
      }
    }
    return ordered;
  };

  const callOpenAiFirewallChat = async (
    history: FirewallChatTurn[],
    context: FirewallChatContext
  ): Promise<string> => {
    if (!deps.firewallChatOpenAiApiKey) {
      throw new Error("OpenAI API key is not configured.");
    }

    const response = await deps.withAbortTimeout(deps.firewallChatTimeoutMs, (signal) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${deps.firewallChatOpenAiApiKey}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          model: deps.firewallChatOpenAiModel,
          temperature: 0.2,
          max_tokens: 700,
          messages: [
            { role: "system", content: buildFirewallChatSystemPrompt(context) },
            ...history.map((turn) => ({ role: turn.role, content: turn.content })),
          ],
        }),
        signal,
      })
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `OpenAI HTTP ${response.status}: ${deps.truncateText(responseText, 220)}`
      );
    }

    const payload = JSON.parse(responseText) as Record<string, unknown>;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice =
      choices.length > 0 && choices[0] && typeof choices[0] === "object"
        ? (choices[0] as Record<string, unknown>)
        : undefined;
    const message =
      firstChoice && typeof firstChoice.message === "object" && firstChoice.message
        ? (firstChoice.message as Record<string, unknown>)
        : undefined;
    const rawContent = message?.content;
    const content = parseChatTurnContent(rawContent);
    if (!content) {
      throw new Error("OpenAI response did not include assistant text.");
    }
    return content;
  };

  const callAnthropicFirewallChat = async (
    history: FirewallChatTurn[],
    context: FirewallChatContext
  ): Promise<string> => {
    const anthropicApiKey = deps.firewallChatAnthropicApiKey;
    if (!anthropicApiKey) {
      throw new Error("Anthropic API key is not configured.");
    }

    const response = await deps.withAbortTimeout(deps.firewallChatTimeoutMs, (signal) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          model: deps.firewallChatAnthropicModel,
          temperature: 0.2,
          max_tokens: 700,
          system: buildFirewallChatSystemPrompt(context),
          messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
        }),
        signal,
      })
    );

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Anthropic HTTP ${response.status}: ${deps.truncateText(responseText, 220)}`
      );
    }

    const payload = JSON.parse(responseText) as Record<string, unknown>;
    const blocks = Array.isArray(payload.content) ? payload.content : [];
    const textChunks = blocks
      .map((block) => {
        if (
          block &&
          typeof block === "object" &&
          (block as Record<string, unknown>).type === "text" &&
          typeof (block as Record<string, unknown>).text === "string"
        ) {
          return String((block as Record<string, unknown>).text).trim();
        }
        return "";
      })
      .filter((chunk) => chunk.length > 0);

    if (textChunks.length === 0) {
      throw new Error("Anthropic response did not include assistant text.");
    }
    return textChunks.join("\n");
  };

  return {
    callAnthropicFirewallChat,
    callOpenAiFirewallChat,
    firewallChatProviderOrder,
    isNetworkActionQuery,
    normalizeFirewallChatHistory,
  };
}
