import * as server from '../entries/pages/_slug_/_page.server.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_slug_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/[slug]/+page.server.js";
export const imports = ["_app/immutable/nodes/3.CtX8GPju.js","_app/immutable/chunks/CBxUoMQf.js","_app/immutable/chunks/CazhmhZi.js","_app/immutable/chunks/PQaj27Yw.js","_app/immutable/chunks/BcqJ6ZNb.js","_app/immutable/chunks/ZMMBrx3F.js","_app/immutable/chunks/BkhafTdk.js","_app/immutable/chunks/a0pJDYsd.js","_app/immutable/chunks/B9Pjjc1c.js","_app/immutable/chunks/BsRRt773.js"];
export const stylesheets = ["_app/immutable/assets/DocsPage.Dii8VZAv.css"];
export const fonts = [];
