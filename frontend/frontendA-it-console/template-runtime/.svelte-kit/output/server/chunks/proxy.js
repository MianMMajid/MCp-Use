const inKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST);
const DEFAULT_LOCAL_GATEWAY_ORIGIN = "http://localhost:4000";
const DEFAULT_K8S_GATEWAY_ORIGIN = "https://gateway-api:3000";
const DEFAULT_LOCAL_ADMIN_CONSOLE_ORIGIN = "https://127.0.0.1:4001";
const DEFAULT_K8S_ADMIN_CONSOLE_ORIGIN = "https://admin-console-api:9443";
function resolveAdminConsoleOrigin(gatewayOrigin) {
  if (inKubernetes) return DEFAULT_K8S_ADMIN_CONSOLE_ORIGIN;
  try {
    const parsedGateway = new URL(gatewayOrigin);
    return `${parsedGateway.protocol}//${parsedGateway.hostname}:4001`;
  } catch {
    return DEFAULT_LOCAL_ADMIN_CONSOLE_ORIGIN;
  }
}
function getGatewayOrigin() {
  return process.env.MAPLE_GATEWAY_ORIGIN ?? (inKubernetes ? DEFAULT_K8S_GATEWAY_ORIGIN : DEFAULT_LOCAL_GATEWAY_ORIGIN);
}
function getAdminOrigin() {
  return process.env.MAPLE_ADMIN_CONSOLE_ORIGIN ?? resolveAdminConsoleOrigin(getGatewayOrigin());
}
function cloneHeaders(headers) {
  const next = new Headers();
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === "host") continue;
    next.set(key, value);
  }
  return next;
}
async function proxyRequest({ request, fetch, targetUrl }) {
  const init = {
    method: request.method,
    headers: cloneHeaders(request.headers),
    body: request.method === "GET" || request.method === "HEAD" ? void 0 : await request.arrayBuffer(),
    redirect: "manual"
  };
  const response = await fetch(targetUrl, init);
  const proxiedHeaders = new Headers(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: proxiedHeaders
  });
}
export {
  getGatewayOrigin as a,
  getAdminOrigin as g,
  proxyRequest as p
};
