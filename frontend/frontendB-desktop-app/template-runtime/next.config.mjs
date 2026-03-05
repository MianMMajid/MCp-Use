import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const inKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST)

const DEFAULT_RAILWAY_GATEWAY_ORIGIN = "https://maple-gateway-production.up.railway.app"
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
const outputTracingRoot = process.env.MAPLE_OUTPUT_TRACING_ROOT
  ? path.resolve(__dirname, process.env.MAPLE_OUTPUT_TRACING_ROOT)
  : null

if (!process.env.MAPLE_GATEWAY_ORIGIN) {
  if (inKubernetes) {
    console.warn('[maple] MAPLE_GATEWAY_ORIGIN is not set — defaulting to https://gateway-api:3000 for Kubernetes deployments.')
  } else {
    console.warn('[maple] MAPLE_GATEWAY_ORIGIN is not set — defaulting to localhost for local development.')
  }
}

const nextConfig = {
  distDir: '.mayple-next',
  ...(outputTracingRoot ? { outputFileTracingRoot: outputTracingRoot } : {}),
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  reactCompiler: true,
  onDemandEntries: {
    maxInactiveAge: 24 * 60 * 60 * 1000,
    pagesBufferLength: 64,
  },
  experimental: {
    optimizePackageImports: [
      'motion',
      '@headlessui/react',
      '@heroicons/react',
    ],
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
  },
  turbopack: {
    root: __dirname,
  },
  webpack: (config) => config,
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
  async redirects() {
    return [
      // Route consolidation: retired control/ops routes -> orchestration or settings
      { source: '/events', destination: '/agents', permanent: true },
      { source: '/events/:id', destination: '/agents/:id', permanent: true },
      { source: '/sessions', destination: '/?mode=orchestration', permanent: false },
      { source: '/sessions/:id', destination: '/?mode=orchestration', permanent: false },
      { source: '/runs', destination: '/?mode=orchestration', permanent: false },
      { source: '/runs/:id', destination: '/?mode=orchestration&executionId=:id&panel=timeline', permanent: false },
      { source: '/orders', destination: '/orchestrate', permanent: true },
      { source: '/orders/:id', destination: '/orchestrate', permanent: true },
      { source: '/modifier-approvals', destination: '/orchestrate', permanent: true },
      { source: '/modifier-approvals/:id', destination: '/orchestrate', permanent: true },
      { source: '/tool-registry', destination: '/orchestrate', permanent: true },
      { source: '/downstream', destination: '/orchestrate', permanent: true },
      { source: '/firewall', destination: '/orchestrate', permanent: true },
      { source: '/modifier-ops', destination: '/orchestrate', permanent: true },
      { source: '/modifier-ops/policy', destination: '/orchestrate', permanent: true },
      { source: '/modifier-ops/compliance', destination: '/orchestrate', permanent: true },
      { source: '/modifier-observability', destination: '/orchestrate', permanent: true },
      { source: '/admin-console', destination: '/settings', permanent: true },
      { source: '/admin', destination: '/settings', permanent: true },
      // Settings aliases retained for account/session essentials
      { source: '/billing', destination: '/settings', permanent: true },
      { source: '/usage', destination: '/settings', permanent: true },
      { source: '/integrations', destination: '/settings', permanent: true },
      { source: '/organization', destination: '/settings', permanent: true },
      { source: '/api-keys', destination: '/settings?tab=api-keys', permanent: true },
      { source: '/service-accounts', destination: '/settings?tab=service-accounts', permanent: true },
      { source: '/profile', destination: '/settings?tab=account', permanent: true },
      { source: '/cli-tools', destination: '/orchestrate', permanent: true },
      { source: '/agent-chat', destination: '/', permanent: true },
      { source: '/community', destination: '/orchestrate', permanent: true },
      { source: '/demo', destination: '/orchestrate', permanent: true },
      { source: '/diagnostics', destination: '/orchestrate', permanent: true },
    ]
  },
}

export default nextConfig
