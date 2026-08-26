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
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        // Cache Drive file/folder listings for up to 60 seconds at the CDN edge.
        // This reduces origin hits for repeated navigation within the same folder,
        // which is a major source of Fast Origin Transfer.
        // Using stale-while-revalidate: serves cached data immediately and
        // refreshes in background, giving a snappy UI without stale content.
        source: "/api/files",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=120",
          },
        ],
      },
      {
        // Cache folder listings used by the explorer
        source: "/api/folders/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=120",
          },
        ],
      },
      {
        // Cache artist data (rarely changes)
        source: "/api/artists/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        // The audio resolve endpoint result can be cached briefly
        // (Drive pre-signed URLs are valid for ~1h)
        source: "/api/audio/:fileId/resolve",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=300", // 5 minutes, private (user-specific auth)
          },
        ],
      },
      {
        // The audio redirect itself — short private cache
        // Browser remembers the redirect target so it won't hit Vercel again
        source: "/api/audio/:fileId",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=300",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
