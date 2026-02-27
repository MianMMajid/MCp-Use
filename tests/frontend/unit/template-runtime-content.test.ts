import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("template runtime content coverage", () => {
  it("frontend A includes gateway and policy endpoint references", () => {
    const gatewayDoc = read("frontend/frontendA-it-console/template-runtime/src/app/maple/gateway/page.mdx");
    const policyDoc = read("frontend/frontendA-it-console/template-runtime/src/app/maple/policies/page.mdx");

    expect(gatewayDoc).toContain("/api/auth/*");
    expect(gatewayDoc).toContain("/api/openclaw/agent/*");
    expect(gatewayDoc).toContain("/api/runtime/feature-capabilities");
    expect(policyDoc).toContain("POST /api/firewall/decision");
  });

  it("frontend B workspace binds to runtime and HITL endpoints", () => {
    const workspace = read("frontend/frontendB-desktop-app/template-runtime/src/app/(app)/maple-workspace.jsx");
    expect(workspace).toContain("/api/runtime/feature-capabilities");
    expect(workspace).toContain("/api/firewall/status");
    expect(workspace).toContain("/api/hitl/list");
    expect(workspace).toContain("Agent Orchestration Workspace");
  });

  it("frontend C landing includes lifecycle and desktop download actions", () => {
    const landing = read("frontend/frontendC-marketing-download-site/template-runtime/src/app/page.jsx");
    expect(landing).toContain("End-to-end journey");
    expect(landing).toContain("/download/maple-desktop.dmg");
    expect(landing).toContain("/download/maple-desktop.exe");
  });
});
