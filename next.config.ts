import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["three"],
  },
  async headers() {
    // datasets and textures are content-stable between `npm run data` runs
    return [
      { source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/textures/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, immutable" }] },
    ];
  },
};

export default nextConfig;
