import type { NextConfig } from "next";

const API_BASE_URL: string = process.env.API_BASE_URL ?? "http://127.0.0.1:8001";

const config: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) || undefined,
    },
  },
  output: "standalone",
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${API_BASE_URL}/api/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
