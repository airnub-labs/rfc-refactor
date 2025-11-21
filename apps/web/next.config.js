/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@e2b/code-interpreter'],
  },
  transpilePackages: ['@e2b-auditor/core'],
}

module.exports = nextConfig
