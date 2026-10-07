import type { NextConfig } from "next";

// Keep the local preview controls clear of the mobile navigation.
const nextConfig: NextConfig = { devIndicators: false };
export default nextConfig;
