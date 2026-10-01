import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/upload": ["./node_modules/pdfjs-dist/**"],
  },
};

export default nextConfig;
