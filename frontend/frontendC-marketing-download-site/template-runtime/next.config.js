const path = require('node:path')

/** @type {import('next').NextConfig} */
const inKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST)

const DEFAULT_LOCAL_GATEWAY_ORIGIN = "http://127.0.0.1:3000"
const DEFAULT_K8S_GATEWAY_ORIGIN = "https://gateway-api:3000"
const DEFAULT_LOCAL_ADMIN_CONSOLE_ORIGIN = "http://127.0.0.1:4001"
const DEFAULT_K8S_ADMIN_CONSOLE_ORIGIN = "https://admin-console-api:9443"

function resolveAdminConsoleOrigin(gatewayOrigin) {
  if (inKubernetes) {
    return DEFAULT_K8S_ADMIN_CONSOLE_ORIGIN
  }
  try {
    const parsedGateway = new URL(gatewayOrigin)
    return `${parsedGateway.protocol}//${parsedGateway.hostname}:4001`
  } catch {
    return DEFAULT_LOCAL_ADMIN_CONSOLE_ORIGIN
  }
}

const mapleGatewayOrigin =
  process.env.MAPLE_GATEWAY_ORIGIN ??
  (inKubernetes ? DEFAULT_K8S_GATEWAY_ORIGIN : DEFAULT_LOCAL_GATEWAY_ORIGIN)

const mapleAdminConsoleOrigin =
  process.env.MAPLE_ADMIN_CONSOLE_ORIGIN ??
  resolveAdminConsoleOrigin(mapleGatewayOrigin)

if (!process.env.MAPLE_GATEWAY_ORIGIN) {
  if (inKubernetes) {
    console.warn('[maple] MAPLE_GATEWAY_ORIGIN is not set — defaulting to https://gateway-api:3000 for Kubernetes deployments.')
  } else {
    console.warn('[maple] MAPLE_GATEWAY_ORIGIN is not set — defaulting to localhost for local development.')
  }
}

const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../../../'),
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${mapleGatewayOrigin}/api/:path*`,
      },
      {
        source: '/admin/api/:path*',
        destination: `${mapleAdminConsoleOrigin}/admin/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
