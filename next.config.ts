import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  async redirects() {
    return [
      { source: '/traffic', destination: '/report', permanent: true },
    ];
  },
};

export default nextConfig;
