import "clsx";
import { D as DocsPage } from "../../../chunks/DocsPage.js";
import { d as docsByPath } from "../../../chunks/content.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const doc = docsByPath["/pagination"];
    DocsPage($$renderer2, { doc });
  });
}
export {
  _page as default
};
