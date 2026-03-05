import { g as getAdminOrigin, p as proxyRequest } from "../../../../../chunks/proxy.js";
async function handler({ params, url, request, fetch }) {
  const joined = params.path ?? "";
  const targetUrl = `${getAdminOrigin()}/admin/api/${joined}${url.search}`;
  return proxyRequest({ request, fetch, targetUrl });
}
const GET = handler;
const POST = handler;
const PUT = handler;
const PATCH = handler;
const DELETE = handler;
const OPTIONS = handler;
export {
  DELETE,
  GET,
  OPTIONS,
  PATCH,
  POST,
  PUT
};
