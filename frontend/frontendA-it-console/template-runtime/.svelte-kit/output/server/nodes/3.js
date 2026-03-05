import * as server from '../entries/pages/_slug_/_page.server.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_slug_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/[slug]/+page.server.js";
export const imports = ["_app/immutable/nodes/3.D4sJtNkr.js","_app/immutable/chunks/BH9Hwi-n.js","_app/immutable/chunks/iXbLd11_.js","_app/immutable/chunks/B6pwNZO2.js","_app/immutable/chunks/Dyj-gO_8.js","_app/immutable/chunks/CHN0UO6c.js","_app/immutable/chunks/DtlpY12a.js","_app/immutable/chunks/EpgkPxzp.js","_app/immutable/chunks/kPkQ9OiJ.js","_app/immutable/chunks/CymqfvFe.js"];
export const stylesheets = ["_app/immutable/assets/DocsPage.Dii8VZAv.css"];
export const fonts = [];
