import { a as attr_class, s as slot } from "../../chunks/index2.js";
import { e as escape_html, a as attr } from "../../chunks/attributes.js";
function FakeDataControl($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let enabled = false;
    let busy = false;
    $$renderer2.push(`<div class="fake-data-fab svelte-8jhnzl" aria-live="polite"><span${attr_class("fake-status svelte-8jhnzl", void 0, { "is-on": enabled })}>${escape_html("FAKE OFF")}</span> <button type="button" class="fake-btn fake-btn-primary svelte-8jhnzl"${attr("disabled", busy, true)}>${escape_html("Generate Fake Data")}</button> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--> `);
    FakeDataControl($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
export {
  _layout as default
};
