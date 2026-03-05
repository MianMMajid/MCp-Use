import { redirect } from "@sveltejs/kit";
const DEFAULT_MAPLE_CHAT_HREF = "/maple?category=chat&view=chat&route=%2Fmaple%2Fobservability";
function load({ url }) {
  const hasExplicitState = url.searchParams.has("category") && url.searchParams.has("view") && url.searchParams.has("route");
  if (!hasExplicitState) {
    throw redirect(307, DEFAULT_MAPLE_CHAT_HREF);
  }
  return {};
}
export {
  load
};
