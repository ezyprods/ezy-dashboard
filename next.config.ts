import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@vreden/youtube_scraper',
    'ffmpeg-static',
    'music-tempo',
    'meyda',
    'node-id3',
  ],
  // Vercel bills "Functions Storage" as the size of every function bundle in
  // every region it deploys to, so anything traced into a route is paid for
  // dozens of times over. These are either downloaded at runtime (the ffmpeg /
  // yt-dlp binaries), browser-only (onnxruntime/ffmpeg.wasm run in the client
  // via WebGPU/WASM), or pure tooling that never executes on the server.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/ffmpeg-static/**',
      'node_modules/puppeteer/**',
      'node_modules/puppeteer-core/**',
      'node_modules/@puppeteer/**',
      'node_modules/chromium-bidi/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/onnxruntime-common/**',
      'node_modules/demucs-web/**',
      'node_modules/@ffmpeg/**',
      'node_modules/typescript/**',
      'node_modules/@swc/**',
      'node_modules/@esbuild/**',
      'node_modules/esbuild/**',
      'node_modules/terser/**',
      'node_modules/eslint/**',
      'node_modules/@typescript-eslint/**',
      'node_modules/prettier/**',
      'node_modules/lightningcss*/**',
      'node_modules/**/*.map',
      'node_modules/**/*.md',
      'node_modules/**/*.d.ts',
      '.git/**',
      '.next/cache/**',
      'scratch/**',
      'scripts/**',
      'bin/**',
      '*.md',
    ],
  },
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
