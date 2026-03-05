import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("template runtime content coverage", () => {
  it("frontend A includes gateway and policy endpoint references", () => {
    const routeRegistry = read("frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/route-registry.js");
    const workspaceState = read("frontend/frontendA-it-console/template-runtime/src/lib/maple-workspace/workspace-state.js");

    expect(routeRegistry).toContain("/api/runtime/feature-capabilities");
    expect(routeRegistry).toContain("/api/firewall/decision");
    expect(workspaceState).toContain("'/maple/policies': '/maple/audit'");
    expect(routeRegistry).toContain("/api/observability/orchestrations/audit-log");
  });

  it("frontend B workspace binds to runtime and HITL endpoints", () => {
    const workspace = read("frontend/frontendB-desktop-app/template-runtime/src/lib/components/ChatWorkspace.svelte");
    const chatStore = read("frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js");
    const orchestrationApi = read("frontend/frontendB-desktop-app/template-runtime/src/lib/orchestrations-api.js");
    const orchestrationPage = read("frontend/frontendB-desktop-app/template-runtime/src/routes/orchestrate/[id]/+page.svelte");
    expect(chatStore).toContain("/api/agents");
    expect(chatStore).toContain("/api/auth/me");
    expect(orchestrationApi).toContain("/api/orchestrations");
    expect(orchestrationApi).toContain("/api/orchestrations/executions");
    expect(orchestrationPage).toContain("Runtime Control Plane");
    expect(orchestrationPage).toContain("Execute Live");
    expect(workspace).toContain("Agent Chat");
    expect(workspace).toContain("Orchestration Chat");
  });

  it("frontend C landing includes lifecycle and desktop download actions", () => {
    const landing = read("frontend/frontendC-marketing-download-site/template-runtime/src/app/page.jsx");
    const downloadSection = read(
      "frontend/frontendC-marketing-download-site/template-runtime/src/components/DownloadSection.jsx"
    );
    expect(landing).toContain("How teams use Maple");
    expect(downloadSection).toContain("/api/downloads/mac");
    expect(downloadSection).toContain("/api/downloads/win");
  });
});
