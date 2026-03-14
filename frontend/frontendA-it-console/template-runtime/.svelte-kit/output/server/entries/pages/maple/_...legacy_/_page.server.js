import { redirect } from "@sveltejs/kit";
import { r as resolveWorkspaceState, b as buildWorkspaceHref } from "../../../../chunks/workspace-state.js";
function load({ params, url }) {
  const legacyParts = Array.isArray(params.legacy) ? params.legacy : [params.legacy].filter(Boolean);
  const pathname = `/maple/${legacyParts.join("/")}`;
  const state = resolveWorkspaceState({ pathname, searchParams: url.searchParams });
  throw redirect(
    307,
    buildWorkspaceHref({
      category: state.category,
      view: state.view,
      routePath: state.routePath,
      executionId: state.executionId,
      sessionId: state.sessionId
    })
  );
}
export {
  load
};
