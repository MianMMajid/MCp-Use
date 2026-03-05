import { error } from "@sveltejs/kit";
import { a as docsBySlug } from "../../../chunks/content.js";
const RESERVED_SLUGS = /* @__PURE__ */ new Set(["maple", "login", "health", "api", "admin"]);
function load({ params }) {
  const slug = String(params.slug ?? "");
  if (RESERVED_SLUGS.has(slug)) {
    throw error(404, "Not found");
  }
  const doc = docsBySlug[slug];
  if (!doc) {
    throw error(404, "Not found");
  }
  return { doc };
}
export {
  load
};
