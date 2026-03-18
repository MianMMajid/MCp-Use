const inKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST)

const DEFAULT_LOCAL_GATEWAY_ORIGIN = 'http://127.0.0.1:3000'
const DEFAULT_K8S_GATEWAY_ORIGIN = 'https://gateway-api:3000'

export function getGatewayOrigin() {
  return process.env.MAPLE_GATEWAY_ORIGIN ?? (inKubernetes ? DEFAULT_K8S_GATEWAY_ORIGIN : DEFAULT_LOCAL_GATEWAY_ORIGIN)
}

export function getAdminOrigin() {
  return process.env.MAPLE_ADMIN_CONSOLE_ORIGIN ?? getGatewayOrigin()
}
