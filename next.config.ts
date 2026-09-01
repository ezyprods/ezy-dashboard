import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@vreden/youtube_scraper',
    'ffmpeg-static',
    'ffprobe-static',
    'yt-dlp-exec',
    'music-tempo',
    'meyda',
    'node-id3',
  ],
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
        // Cache dashboard metrics and pulse
        source: "/api/dashboard/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
      {
        // Cache personal projects listing
        source: "/api/personal-projects",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
      {
        // Cache payments listing
        source: "/api/payments",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
      {
        // Cache calendar events
        source: "/api/calendar",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=120",
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
        // The audio redirect/streaming endpoint — browser cache
        source: "/api/audio/:fileId",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};


export default nextConfig;
