import * as server from '../entries/pages/_page.server.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.js";
export const imports = ["_app/immutable/nodes/2.CCVxp1lb.js","_app/immutable/chunks/CBxUoMQf.js","_app/immutable/chunks/CazhmhZi.js","_app/immutable/chunks/PQaj27Yw.js","_app/immutable/chunks/BkhafTdk.js","_app/immutable/chunks/a0pJDYsd.js","_app/immutable/chunks/B9Pjjc1c.js","_app/immutable/chunks/BsRRt773.js","_app/immutable/chunks/BcqJ6ZNb.js","_app/immutable/chunks/ZMMBrx3F.js","_app/immutable/chunks/2rHXOVXQ.js"];
export const stylesheets = ["_app/immutable/assets/DocsPage.Dii8VZAv.css"];
export const fonts = [];
