import type { NextConfig } from "next";

// Keep the local preview controls clear of the mobile navigation.
const nextConfig: NextConfig = {
  devIndicators: false,
  // Development fixtures, operator launchers and evidence are never runtime assets.
  outputFileTracingExcludes: {
    '/**': ['./scripts/**', './docs/**', './**/assistant-smoke-approval-*/**'],
  },
};
export default nextConfig;
