import { c as bind_props } from "../../../chunks/index2.js";
import { D as DocsPage } from "../../../chunks/DocsPage.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let data = $$props["data"];
    DocsPage($$renderer2, { doc: data.doc });
    bind_props($$props, { data });
  });
}
export {
  _page as default
};
