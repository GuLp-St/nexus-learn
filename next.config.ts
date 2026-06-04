import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "@napi-rs/canvas"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb", // Increase limit to handle large image uploads from multiple PDF pages
    },
  },
};

export default nextConfig;
