import type { MarketplaceProvider } from "./marketplace-provider.js";

export function buildMapleGetStartedPlan(options: {
  goal?: string;
  provider: MarketplaceProvider | "all";
  connectedApps: Array<{
    id: string;
    name: string;
    provider?: MarketplaceProvider;
  }>;
}) {
  const goal = options.goal ?? "general task";
  if (options.connectedApps.length > 0) {
    return {
      mode: "ready",
      message:
        "Maple already has connected downstream apps. Call maple_autoroute_call with the desired toolName to execute without UI steps.",
      nextCalls: [
        {
          step: 1,
          method: "tools/call",
          params: {
            name: "maple_autoroute_call",
            arguments: {
              toolName: "replace_with_tool_name",
              arguments: {},
              autoConnect: true,
            },
          },
        },
      ],
      guidance: [
        "Run tools/list to inspect currently available downstream tools.",
        "If multiple apps expose the same tool, pass appId or use appId::toolName.",
      ],
    };
  }

  return {
    mode: "needs_connection",
    message:
      "No downstream apps are connected yet. Use the next calls below in order; no dashboard buttons are required.",
    nextCalls: [
      {
        step: 1,
        method: "tools/call",
        params: {
          name: "maple_marketplace_search",
          arguments: {
            provider: options.provider,
            query: goal,
            limit: 5,
          },
        },
      },
      {
        step: 2,
        method: "tools/call",
        params: {
          name: "maple_marketplace_connect",
          arguments: {
            provider: options.provider === "all" ? "mcpso" : options.provider,
            id: "choose_id_from_step_1",
          },
        },
      },
      {
        step: 3,
        method: "tools/call",
        params: {
          name: "maple_autoroute_call",
          arguments: {
            toolName: "replace_with_tool_name",
            arguments: {},
            autoConnect: true,
          },
        },
      },
    ],
    guidance: [
      "Prefer maple_autoroute_call for execution; it resolves/auto-connects apps when possible.",
      "Use maple_marketplace_connected_apps to verify connected app IDs.",
    ],
  };
}
