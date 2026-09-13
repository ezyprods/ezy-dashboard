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
      // NOTE: The JSON data endpoints (/api/files, /api/artists, /api/dashboard, /api/payments,
      // /api/calendar, /api/personal-projects...) must NOT be cached at the CDN edge: they back
      // mutations (create / rename / move / delete) and a cached copy made the UI show stale data
      // (deleted files reappearing, new matrices missing, and read-modify-write saves built on
      // outdated state). The app keeps its own in-memory cache on the client (AppDataContext).
      //
      // Binary endpoints (/api/audio/[fileId] and /api/files/[fileId]) set their own Cache-Control
      // headers inside the route handlers, where the cache key is versioned per file.
    ];
  },
};


export default nextConfig;
