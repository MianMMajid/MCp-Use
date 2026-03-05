import { e as ensure_array_like, b as bind_props } from "./index2.js";
import { e as escape_html, a as attr } from "./attributes.js";
function DocsPage($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let doc = $$props["doc"];
    $$renderer2.push(`<main class="docs-page svelte-96s4qt"><header class="hero svelte-96s4qt"><h1>${escape_html(doc?.title ?? "Documentation")}</h1> `);
    if (doc?.summary) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="svelte-96s4qt">${escape_html(doc.summary)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (doc?.ctas?.length) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="cta-row svelte-96s4qt"><!--[-->`);
      const each_array = ensure_array_like(doc.ctas);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let cta = each_array[$$index];
        $$renderer2.push(`<a${attr("href", cta.href)} class="svelte-96s4qt">${escape_html(cta.label)}</a>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></header> `);
    if (doc?.sections?.length) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_1 = ensure_array_like(doc.sections);
      for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
        let section = each_array_1[$$index_2];
        $$renderer2.push(`<section${attr("id", section.id)} class="card svelte-96s4qt"><h2 class="svelte-96s4qt">${escape_html(section.title)}</h2> `);
        if (section.body) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p>${escape_html(section.body)}</p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (section.bullets?.length) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<ul class="svelte-96s4qt"><!--[-->`);
          const each_array_2 = ensure_array_like(section.bullets);
          for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
            let bullet = each_array_2[$$index_1];
            $$renderer2.push(`<li>${escape_html(bullet)}</li>`);
          }
          $$renderer2.push(`<!--]--></ul>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (section.code) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<pre class="svelte-96s4qt"><code>${escape_html(section.code)}</code></pre>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></section>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></main>`);
    bind_props($$props, { doc });
  });
}
export {
  DocsPage as D
};
