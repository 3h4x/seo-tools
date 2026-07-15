import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // Disable Next's build-time worker threads. The multi-platform Docker build
  // (.github/workflows/release.yml) cross-compiles linux/arm64 under QEMU
  // user-mode emulation on GitHub's x86 runners, and QEMU intermittently
  // crashes with "qemu: uncaught target signal 4 (Illegal instruction)" when
  // `next build` spawns worker threads for page compilation — a known
  // instability in QEMU's emulation of Node's worker_threads. Forcing a
  // single-threaded build avoids the crash; it only slows the build itself,
  // not runtime performance.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
