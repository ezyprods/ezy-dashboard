import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply Cross-Origin Isolation headers to all dashboard and portal routes
        // Required for SharedArrayBuffer used by FFmpeg.wasm
        source: "/((?!api|_next|favicon|icon).*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
