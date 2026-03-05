import * as server from '../entries/pages/_page.server.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.js";
export const imports = ["_app/immutable/nodes/2.KG7KQ1CI.js","_app/immutable/chunks/Lw7-F3fC.js","_app/immutable/chunks/CumqLj6T.js","_app/immutable/chunks/pawvQQtv.js","_app/immutable/chunks/D9bi5j9V.js","_app/immutable/chunks/BmmFhtRl.js","_app/immutable/chunks/Cw9SDOlT.js","_app/immutable/chunks/BBQKNmOU.js","_app/immutable/chunks/D2q4JMEd.js","_app/immutable/chunks/DGHUnuJg.js","_app/immutable/chunks/BTpW48VA.js","_app/immutable/chunks/2rHXOVXQ.js"];
export const stylesheets = ["_app/immutable/assets/DocsPage.Dii8VZAv.css"];
export const fonts = [];
