import * as server from '../entries/pages/_slug_/_page.server.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_slug_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/[slug]/+page.server.js";
export const imports = ["_app/immutable/nodes/3.CgrAdlfZ.js","_app/immutable/chunks/Lw7-F3fC.js","_app/immutable/chunks/CumqLj6T.js","_app/immutable/chunks/pawvQQtv.js","_app/immutable/chunks/DGHUnuJg.js","_app/immutable/chunks/BTpW48VA.js","_app/immutable/chunks/D9bi5j9V.js","_app/immutable/chunks/BmmFhtRl.js","_app/immutable/chunks/Cw9SDOlT.js","_app/immutable/chunks/BBQKNmOU.js","_app/immutable/chunks/D2q4JMEd.js"];
export const stylesheets = ["_app/immutable/assets/DocsPage.Dii8VZAv.css"];
export const fonts = [];
