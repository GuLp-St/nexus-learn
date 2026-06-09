import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/extract-file": ["./node_modules/pdf-parse/**/*"],
    "/api/extract-pdf-pages": ["./node_modules/pdf-parse/**/*"],
    "/api/course-creation/upload": ["./node_modules/pdf-parse/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb", // Increase limit to handle large image uploads from multiple PDF pages
    },
  },
};

export default nextConfig;
