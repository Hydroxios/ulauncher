/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  trailingSlash: true,
  experimental: {
    externalDir: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    return config
  },
}
