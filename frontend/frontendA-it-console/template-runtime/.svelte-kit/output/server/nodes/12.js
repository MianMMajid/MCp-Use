import * as server from '../entries/pages/maple/_page.server.js';

export const index = 12;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/maple/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/maple/+page.server.js";
export const imports = ["_app/immutable/nodes/12.DNpif2sr.js","_app/immutable/chunks/BH9Hwi-n.js","_app/immutable/chunks/iXbLd11_.js","_app/immutable/chunks/B6pwNZO2.js","_app/immutable/chunks/yiFNK72W.js","_app/immutable/chunks/EpgkPxzp.js","_app/immutable/chunks/kPkQ9OiJ.js","_app/immutable/chunks/CymqfvFe.js","_app/immutable/chunks/IFO2A1Lr.js","_app/immutable/chunks/C-1GcSVy.js","_app/immutable/chunks/Dyj-gO_8.js","_app/immutable/chunks/CHN0UO6c.js","_app/immutable/chunks/Cvn2JKTt.js","_app/immutable/chunks/2rHXOVXQ.js"];
export const stylesheets = [];
export const fonts = [];
