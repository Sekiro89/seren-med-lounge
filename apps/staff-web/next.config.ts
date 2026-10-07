import type { NextConfig } from 'next';
import path from 'path';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
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
