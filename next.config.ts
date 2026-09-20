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
  // dozens of times over.
  //
  // Keep this list CONSERVATIVE. A broader set of excludes (build tooling,
  // `**/*.d.ts`, `**/*.map`...) was tried and took down every serverless
  // function in production with a 500 while the static pages kept serving —
  // the bundles were missing something the runtime needed. The real win came
  // from dropping `googleapis` (203 MB) for `@googleapis/drive`, not from
  // these globs, so don't trade uptime for a few more megabytes here.
  //
  // Everything below is only ever used at build time or in the browser:
  // the ffmpeg/yt-dlp binaries are downloaded at runtime on Vercel, and
  // onnxruntime/ffmpeg.wasm run client-side via WebGPU/WASM.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/ffmpeg-static/**',
      'node_modules/puppeteer/**',
      'node_modules/puppeteer-core/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/demucs-web/**',
      'node_modules/@ffmpeg/**',
      '.git/**',
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
