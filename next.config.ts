// next.config.ts
// (root) — strip the `/api` prefix so FE `/api/...` hits FastAPI `/:path*`
import type { NextConfig } from "next";

const API_BASE_URL: string =
  process.env.API_BASE_URL ?? "http://127.0.0.1:8001";

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
        // Examples:
        //   FE: /api/v1/performance_metrics -> BE: /v1/performance_metrics
        //   FE: /api/accounts               -> BE: /accounts
        { source: "/api/:path*", destination: `${API_BASE_URL}/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
