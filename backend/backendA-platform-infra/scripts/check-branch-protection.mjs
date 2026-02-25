#!/usr/bin/env node

function parseArgs(argv) {
  const options = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) {
      continue;
    }
    const [name, value = ""] = raw.slice(2).split("=");
    options[name] = value;
  }
  return options;
}

function fail(message) {
  console.error(`[error] ${message}`);
  process.exit(1);
}

function patternToRegex(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function patternMatchesBranch(pattern, branch) {
  if (!pattern || !branch) {
    return false;
  }
  try {
    return patternToRegex(pattern).test(branch);
  } catch {
    return false;
  }
}

function selectRuleForBranch(rules, branch) {
  const matching = rules.filter((rule) => patternMatchesBranch(rule.pattern, branch));
  if (matching.length === 0) {
    return null;
  }
  const exact = matching.find((rule) => rule.pattern === branch);
  if (exact) {
    return exact;
  }
  return matching.sort((a, b) => String(b.pattern).length - String(a.pattern).length)[0];
}

async function queryBranchProtectionRules({ owner, repo, token }) {
  const query = `
    query BranchProtectionRules($owner: String!, $repo: String!, $after: String) {
      repository(owner: $owner, name: $repo) {
        branchProtectionRules(first: 100, after: $after) {
          nodes {
            pattern
            isAdminEnforced
            requiresApprovingReviews
            requiredApprovingReviewCount
            requiresCodeOwnerReviews
            requiresStatusChecks
            requiresStrictStatusChecks
            requiredStatusCheckContexts
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const rules = [];
  let after;
  do {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "maple-branch-protection-check",
      },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          repo,
          after: after ?? null,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub GraphQL request failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      const reason = payload.errors.map((entry) => entry.message).join("; ");
      throw new Error(`GitHub GraphQL returned errors: ${reason}`);
    }

    const branchProtection = payload?.data?.repository?.branchProtectionRules;
    if (!branchProtection) {
      throw new Error("No branchProtectionRules data returned from GitHub API.");
    }

    rules.push(...(branchProtection.nodes ?? []));
    after = branchProtection.pageInfo?.hasNextPage
      ? branchProtection.pageInfo?.endCursor
      : undefined;
  } while (after);

  return rules;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = process.env.GITHUB_TOKEN?.trim();
  const repoSlug = (args.repo || process.env.GITHUB_REPOSITORY || "").trim();
  const branch = (args.branch || process.env.MAPLE_BRANCH_PROTECTION_BRANCH || "main").trim();
  const requiredCheck = (
    args["required-check"] ||
    process.env.MAPLE_BRANCH_PROTECTION_REQUIRED_CHECK ||
    "backend-checks"
  ).trim();

  if (!token) {
    fail("GITHUB_TOKEN is required.");
  }
  if (!repoSlug || !repoSlug.includes("/")) {
    fail("Repository slug is required (owner/repo). Set --repo or GITHUB_REPOSITORY.");
  }

  const [owner, repo] = repoSlug.split("/", 2);
  const rules = await queryBranchProtectionRules({ owner, repo, token });
  const selected = selectRuleForBranch(rules, branch);
  if (!selected) {
    fail(
      `No branch protection rule matches '${branch}'. Existing patterns: ${rules
        .map((rule) => rule.pattern)
        .join(", ")}`
    );
  }

  const errors = [];
  if (!selected.isAdminEnforced) {
    errors.push("enforce_admins must be true.");
  }
  if (!selected.requiresStatusChecks) {
    errors.push("requiresStatusChecks must be true.");
  } else if (
    requiredCheck &&
    (!Array.isArray(selected.requiredStatusCheckContexts) ||
      !selected.requiredStatusCheckContexts.includes(requiredCheck))
  ) {
    errors.push(
      `requiredStatusCheckContexts must include '${requiredCheck}' (actual: ${(
        selected.requiredStatusCheckContexts || []
      ).join(", ")}).`
    );
  }
  if (!selected.requiresStrictStatusChecks) {
    errors.push("requiresStrictStatusChecks must be true.");
  }
  if (!selected.requiresApprovingReviews) {
    errors.push("requiresApprovingReviews must be true.");
  }
  if (Number(selected.requiredApprovingReviewCount || 0) < 1) {
    errors.push("requiredApprovingReviewCount must be at least 1.");
  }
  if (!selected.requiresCodeOwnerReviews) {
    errors.push("requiresCodeOwnerReviews must be true.");
  }

  if (errors.length > 0) {
    fail(
      `Branch protection for '${branch}' is incomplete. ${errors.join(" ")} (matched pattern: '${
        selected.pattern
      }')`
    );
  }

  console.log(
    `[ok] Branch protection verified for '${branch}' (pattern '${selected.pattern}') with required check '${requiredCheck}'.`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
