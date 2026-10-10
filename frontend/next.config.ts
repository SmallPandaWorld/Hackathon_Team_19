import type { NextConfig } from "next";

const BACKEND_URL = process.env.NODE_ENV == "production" ? "http://backend:8000" : "http://localhost:8000";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  // Keep the dev badge off the sidebar's theme switch (bottom-left).
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
