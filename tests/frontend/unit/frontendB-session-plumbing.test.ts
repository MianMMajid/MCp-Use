import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("frontend B session plumbing", () => {
  it("loads agent sessions from the agent-scoped endpoint", () => {
    const chatStore = read("frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js");

    expect(chatStore).toContain("/api/agents/${encodeURIComponent(normalizedAgentId)}/sessions");
    expect(chatStore).not.toContain("loadJson('/api/openclaw/agent/sessions').catch");
  });

  it("allocates a unique agent session id before the first run", () => {
    const chatStore = read("frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js");

    expect(chatStore).toContain("createAgentSessionId");
    expect(chatStore).toContain("const sessionId = state.sessionId || createAgentSessionId(agentId);");
  });
});
