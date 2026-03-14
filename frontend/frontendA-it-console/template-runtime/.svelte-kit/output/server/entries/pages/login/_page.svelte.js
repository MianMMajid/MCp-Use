import { a as attr, e as escape_html } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let email = "";
    let password = "";
    let loading = false;
    $$renderer2.push(`<div class="login-wrap svelte-1x05zx6"><div class="login-card svelte-1x05zx6"><h1>Mayple IT Console</h1> <p>Sign in to access the admin dashboard</p> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <form class="svelte-1x05zx6"><label class="svelte-1x05zx6">Email <input type="email"${attr("value", email)} required="" class="svelte-1x05zx6"/></label> <label class="svelte-1x05zx6">Password <input type="password"${attr("value", password)} required="" class="svelte-1x05zx6"/></label> <button type="submit"${attr("disabled", loading, true)} class="svelte-1x05zx6">${escape_html("Sign in")}</button></form> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
