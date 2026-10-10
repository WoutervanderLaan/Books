import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native SQLite driver must stay a plain Node require.
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      // Bank exports for a full year can be a few MB.
      bodySizeLimit: "25mb",
    },
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
