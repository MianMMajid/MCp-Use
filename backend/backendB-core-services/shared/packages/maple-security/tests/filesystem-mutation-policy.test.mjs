import assert from "node:assert/strict";
import test from "node:test";

import { buildFilesystemMutationPlan } from "../src/filesystem-mutation-policy.js";

const workspaceRoot = "/tmp/maple-fs-policy";

test("filesystem mutation policy hard-denies protected and sensitive targets", () => {
  const protectedPlan = buildFilesystemMutationPlan(
    {
      operations: [{ op: "delete", path: "/etc/passwd" }],
      workspaceRoot,
    },
    { workspaceRoot, allowedRoots: [workspaceRoot] },
  );
  assert.equal(protectedPlan.detected, true);
  assert.equal(protectedPlan.lane, "hard_deny");

  const sensitivePlan = buildFilesystemMutationPlan(
    {
      operations: [{ op: "delete", path: `${workspaceRoot}/.env.local` }],
      workspaceRoot,
    },
    { workspaceRoot, allowedRoots: [workspaceRoot] },
  );
  assert.equal(sensitivePlan.lane, "hard_deny");
});

test("filesystem mutation policy directly allows small generated cleanup", () => {
  const plan = buildFilesystemMutationPlan(
    {
      operations: [{ op: "delete", path: `${workspaceRoot}/dist/bundle.js` }],
      workspaceRoot,
    },
    { workspaceRoot, allowedRoots: [workspaceRoot], directMaxPaths: 4 },
  );
  assert.equal(plan.detected, true);
  assert.equal(plan.lane, "direct_allow");
  assert.equal(plan.pathClassifications[0]?.classification, "generated");
});

test("filesystem mutation policy requires a fork for user-authored deletes and overwrites", () => {
  const deletePlan = buildFilesystemMutationPlan(
    {
      operations: [{ op: "delete", path: `${workspaceRoot}/src/index.js` }],
      workspaceRoot,
    },
    { workspaceRoot, allowedRoots: [workspaceRoot] },
  );
  assert.equal(deletePlan.lane, "fork_required");

  const overwritePlan = buildFilesystemMutationPlan(
    {
      operations: [{ op: "overwrite", path: `${workspaceRoot}/README.md`, content: "rewritten" }],
      workspaceRoot,
    },
    { workspaceRoot, allowedRoots: [workspaceRoot] },
  );
  assert.equal(overwritePlan.lane, "fork_required");
});

test("filesystem mutation policy treats ambiguous shell deletes as approval-required", () => {
  const plan = buildFilesystemMutationPlan(
    {
      command: "rm -rf",
      workspaceRoot,
      sourceType: "shell",
    },
    { workspaceRoot, allowedRoots: [workspaceRoot] },
  );
  assert.equal(plan.detected, true);
  assert.equal(plan.lane, "approval_required");
});
