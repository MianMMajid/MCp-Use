import { fileURLToPath } from 'node:url'
import path from 'node:path'
import nextMDX from '@next/mdx'

import { recmaPlugins } from './src/mdx/recma.mjs'
import { rehypePlugins } from './src/mdx/rehype.mjs'
import { remarkPlugins } from './src/mdx/remark.mjs'
import withSearch from './src/mdx/search.mjs'

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
})

const inKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST)

const DEFAULT_RAILWAY_GATEWAY_ORIGIN = "https://maple-gateway-production.up.railway.app"
const DEFAULT_LOCAL_GATEWAY_ORIGIN = "http://localhost:4000"
const DEFAULT_K8S_GATEWAY_ORIGIN = "https://gateway-api:3000"
const DEFAULT_LOCAL_ADMIN_CONSOLE_ORIGIN = "https://127.0.0.1:4001"
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

/** @type {import('next').NextConfig} */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../../../'),
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 24,
  },
  outputFileTracingIncludes: {
    '/**/*': ['./src/app/**/*.mdx'],
  },
  experimental: {
    optimizePackageImports: [
      'framer-motion',
      '@headlessui/react',
      'zustand',
      'shiki',
      'flexsearch',
      'react-highlight-words',
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Persistent disk cache — survives dev server restarts
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [fileURLToPath(import.meta.url)],
        },
      }
      // Skip expensive optimization passes irrelevant in dev
      config.output.pathinfo = false
      config.optimization.removeAvailableModules = false
      config.optimization.removeEmptyChunks = false
      config.optimization.splitChunks = false
      config.optimization.runtimeChunk = true
      // Fewer filesystem stat calls per import
      config.resolve.extensions = ['.jsx', '.js', '.mjs', '.json']
      // Don't watch node_modules / .git / .next
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
      }
    }
    return config
  },
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

export default withSearch(withMDX(nextConfig))
