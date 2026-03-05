import * as server from '../entries/pages/maple/_page.server.js';

export const index = 12;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/maple/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/maple/+page.server.js";
export const imports = ["_app/immutable/nodes/12.CqzLjzEH.js","_app/immutable/chunks/CBxUoMQf.js","_app/immutable/chunks/CazhmhZi.js","_app/immutable/chunks/PQaj27Yw.js","_app/immutable/chunks/CVzWwZtW.js","_app/immutable/chunks/a0pJDYsd.js","_app/immutable/chunks/B9Pjjc1c.js","_app/immutable/chunks/BsRRt773.js","_app/immutable/chunks/B_dTfDPi.js","_app/immutable/chunks/BepMX5GF.js","_app/immutable/chunks/BcqJ6ZNb.js","_app/immutable/chunks/ZMMBrx3F.js","_app/immutable/chunks/AirwjYgq.js","_app/immutable/chunks/2rHXOVXQ.js"];
export const stylesheets = [];
export const fonts = [];
