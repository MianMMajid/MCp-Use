/** @type {import('next').NextConfig} */
const mapleGatewayOrigin =
  process.env.MAPLE_GATEWAY_ORIGIN ?? 'http://127.0.0.1:3000'

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${mapleGatewayOrigin}/api/:path*`,
      },
      {
        source: '/admin/api/:path*',
        destination: `${mapleGatewayOrigin}/admin/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
