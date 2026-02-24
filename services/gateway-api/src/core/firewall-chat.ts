export type {
  FirewallBlockedStepSummary,
  FirewallActionSummary,
  FirewallChatContext,
} from "./firewall-chat-context.js";
export {
  formatRuleLabel,
  stepCommandOrUrl,
  stepGuardReason,
  stepFirewallRule,
  toFirewallActionSummary,
  buildFirewallRecommendations,
  buildFirewallChatContextFromTrace,
} from "./firewall-chat-context.js";

export {
  extractStepIndexFromQuestion,
  answerFirewallChatQuestion,
  isNetworkActionQuery,
} from "./firewall-chat-rules.js";

export type {
  FirewallChatRole,
  FirewallChatTurn,
  FirewallChatReplyResult,
} from "./firewall-chat-ai.js";
export {
  parseChatTurnContent,
  normalizeFirewallChatHistory,
  buildFirewallChatSystemPrompt,
  isContextWallAvailable,
  generateFirewallChatReply,
} from "./firewall-chat-ai.js";
