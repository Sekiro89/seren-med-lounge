import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Produces .next/standalone — a minimal, self-contained server bundle
  // for Docker (see apps/staff-web/Dockerfile) instead of needing the
  // whole node_modules tree at runtime.
  output: 'standalone',
  // This is a pnpm workspace monorepo — without this, Next's file
  // tracing only looks inside apps/staff-web/ and misses the
  // @serenemed/* packages/workspace node_modules it actually needs.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
