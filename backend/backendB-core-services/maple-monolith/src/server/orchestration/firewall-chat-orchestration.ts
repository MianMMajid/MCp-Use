export type FirewallChatAiProvider = "openai" | "anthropic";

export interface FirewallChatReplyResult {
  reply: string;
  mode: "ai" | "rules";
  provider: FirewallChatAiProvider | null;
  attempts: Array<{ provider: FirewallChatAiProvider; ok: boolean; error?: string }>;
}

interface CreateFirewallChatOrchestrationDeps {
  answerFirewallChatQuestion: (question: string, context: any) => string;
  callAnthropicFirewallChat: (history: any[], context: any) => Promise<string>;
  callOpenAiFirewallChat: (history: any[], context: any) => Promise<string>;
  errorMessage: (error: unknown) => string;
  firewallChatAiEnabled: boolean;
  firewallChatProviderOrder: () => FirewallChatAiProvider[];
  isNetworkActionQuery: (question: string) => boolean;
  mapleLog: (
    level: "debug" | "info" | "warn" | "error",
    event: string,
    payload?: Record<string, unknown>
  ) => void;
  normalizeFirewallChatHistory: (rawMessages: unknown, fallbackQuestion: string) => any[];
}

export function createFirewallChatOrchestration(deps: CreateFirewallChatOrchestrationDeps): {
  generateFirewallChatReply: (options: {
    question: string;
    context: any;
    messages?: unknown;
  }) => Promise<FirewallChatReplyResult>;
} {
  const {
    answerFirewallChatQuestion,
    callAnthropicFirewallChat,
    callOpenAiFirewallChat,
    errorMessage,
    firewallChatAiEnabled,
    firewallChatProviderOrder,
    isNetworkActionQuery,
    mapleLog,
    normalizeFirewallChatHistory,
  } = deps;

  const generateFirewallChatReply = async (options: {
    question: string;
    context: any;
    messages?: unknown;
  }): Promise<FirewallChatReplyResult> => {
    const fallbackReply = answerFirewallChatQuestion(options.question, options.context);
    if (
      isNetworkActionQuery(options.question) &&
      (options.context.activity?.networkActions?.length ?? 0) > 0
    ) {
      return {
        reply: fallbackReply,
        mode: "rules",
        provider: null,
        attempts: [],
      };
    }

    if (!firewallChatAiEnabled) {
      return {
        reply: fallbackReply,
        mode: "rules",
        provider: null,
        attempts: [],
      };
    }

    const history = normalizeFirewallChatHistory(options.messages, options.question);
    const providers = firewallChatProviderOrder();
    const attempts: Array<{ provider: FirewallChatAiProvider; ok: boolean; error?: string }> = [];
    for (const provider of providers) {
      try {
        const reply =
          provider === "openai"
            ? await callOpenAiFirewallChat(history, options.context)
            : await callAnthropicFirewallChat(history, options.context);
        attempts.push({ provider, ok: true });
        return {
          reply,
          mode: "ai",
          provider,
          attempts,
        };
      } catch (providerError) {
        attempts.push({
          provider,
          ok: false,
          error: errorMessage(providerError),
        });
      }
    }

    mapleLog("warn", "firewall.chat.ai_fallback_to_rules", {
      attempts,
      traceId: options.context.trace?.id ?? null,
    });

    return {
      reply: fallbackReply,
      mode: "rules",
      provider: null,
      attempts,
    };
  };

  return { generateFirewallChatReply };
}
