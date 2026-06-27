/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // allow multiple receipt images per expense
  },
  // A custom server (server.ts) hosts Next.js + Socket.IO, so we do NOT use
  // `output: 'standalone'`. The Docker runtime image keeps node_modules and
  // runs `tsx server.ts`.
  eslint: {
    // Lint is run explicitly in CI (`npm run lint`); don't fail production
    // image builds on lint-only issues.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
