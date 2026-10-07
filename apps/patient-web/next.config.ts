import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Produces .next/standalone — a minimal, self-contained server bundle
  // for Docker (see apps/patient-web/Dockerfile) instead of needing the
  // whole node_modules tree at runtime.
  output: 'standalone',
  // This is a pnpm workspace monorepo — without this, Next's file
  // tracing only looks inside apps/patient-web/ and misses the
  // @serenemed/* packages/workspace node_modules it actually needs.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Development only: the floating Next badge sits on the tab bar or the bell
  // wherever it goes; build errors still open the full-screen overlay.
  devIndicators: false,
};

export default nextConfig;
