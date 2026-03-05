import * as server from '../entries/pages/maple/_page.server.js';

export const index = 11;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/maple/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/maple/+page.server.js";
export const imports = ["_app/immutable/nodes/11.DIUco9L2.js","_app/immutable/chunks/Lw7-F3fC.js","_app/immutable/chunks/CumqLj6T.js","_app/immutable/chunks/pawvQQtv.js","_app/immutable/chunks/D2ODcbmA.js","_app/immutable/chunks/BmmFhtRl.js","_app/immutable/chunks/Cw9SDOlT.js","_app/immutable/chunks/BBQKNmOU.js","_app/immutable/chunks/D2q4JMEd.js","_app/immutable/chunks/bePgpR4D.js","_app/immutable/chunks/DGHUnuJg.js","_app/immutable/chunks/BTpW48VA.js","_app/immutable/chunks/C2iqHNqn.js","_app/immutable/chunks/2rHXOVXQ.js"];
export const stylesheets = [];
export const fonts = [];
