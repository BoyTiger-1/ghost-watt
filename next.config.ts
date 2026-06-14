import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in the home dir
  // was being picked up otherwise).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
