import type { NextConfig } from "next";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const config: NextConfig = {
  experimental: {
    serverActions: {
      // If empty, default same-origin rules apply.
      allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined,
    },
  },
  // Recommended for Docker/self-host
  output: "standalone",
  devIndicators: false,
};

export default config;
