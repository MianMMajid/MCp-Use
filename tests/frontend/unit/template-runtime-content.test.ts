import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("template runtime content coverage", () => {
  it("frontend A includes gateway and policy endpoint references", () => {
    const gatewayPage = read("frontend/frontendA-it-console/template-runtime/src/routes/maple/gateway/+page.svelte");
    const policiesPage = read("frontend/frontendA-it-console/template-runtime/src/routes/maple/policies/+page.svelte");
    const auditPage = read("frontend/frontendA-it-console/template-runtime/src/routes/maple/audit/+page.svelte");

    expect(gatewayPage).toContain('routePath="/maple/gateway"');
    expect(policiesPage).toContain('routePath="/maple/policies"');
    expect(auditPage).toContain('routePath="/maple/audit"');
  });

  it("frontend B workspace binds to runtime and HITL endpoints via SvelteKit stores", () => {
    const chatStore = read("frontend/frontendB-desktop-app/template-runtime/src/lib/stores/chat-store.js");
    expect(chatStore).toContain("/api/agents");
    expect(chatStore).toContain("/api/orchestrations");
    expect(chatStore).toContain("/api/auth/me");
  });

  it("frontend C landing includes lifecycle and desktop download actions", () => {
    const landing = read("frontend/frontendC-marketing-download-site/template-runtime/src/app/page.jsx");
    const downloadSection = read(
      "frontend/frontendC-marketing-download-site/template-runtime/src/components/DownloadSection.jsx"
    );
    expect(landing).toContain("How it works");
    expect(downloadSection).toContain("/api/downloads/mac");
    expect(downloadSection).toContain("/api/downloads/win");
  });
});
