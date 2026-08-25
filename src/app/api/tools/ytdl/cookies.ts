import fs from 'fs';
import path from 'path';
import os from 'os';

// NOTE: We do NOT embed cookies in source code anymore.
//       Embedded cookies expire and cause "Sign in to confirm you're not a bot"
//       errors on datacenter IPs (Vercel). Instead, set YOUTUBE_COOKIES_BASE64
//       in your Vercel environment variables with fresh cookies when needed.
//       Most YouTube videos work without cookies when using the mediaconnect
//       or tv_embedded player clients.

let cookiesFilePath: string | null = null;

export async function getYouTubeCookiesFile(): Promise<string | null> {
  if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
    return cookiesFilePath;
  }

  let cookiesContent: string | null = null;

  // Priority 1: base64-encoded env var (set in Vercel dashboard)
  if (process.env.YOUTUBE_COOKIES_BASE64) {
    try {
      cookiesContent = Buffer.from(
        process.env.YOUTUBE_COOKIES_BASE64,
        'base64'
      ).toString('utf-8');
    } catch (e) {
      console.warn('[ytdl/cookies] Failed to decode YOUTUBE_COOKIES_BASE64:', e);
    }
  }

  // Priority 2: plain text env var
  if (!cookiesContent && process.env.YOUTUBE_COOKIES) {
    cookiesContent = process.env.YOUTUBE_COOKIES;
  }

  if (!cookiesContent || cookiesContent.trim().length < 10) {
    return null;
  }

  // Remove BOM if present (common when exporting cookies on Windows)
  cookiesContent = cookiesContent.replace(/^\uFEFF/, '');

  // Validate it looks like a Netscape cookie file
  if (
    !cookiesContent.includes('# Netscape HTTP Cookie File') &&
    !cookiesContent.includes('.youtube.com')
  ) {
    console.warn('[ytdl/cookies] Cookie content does not look like a Netscape cookie file, ignoring');
    return null;
  }

  cookiesFilePath = path.join(os.tmpdir(), 'yt-cookies.txt');
  try {
    // Write without BOM, UTF-8 only
    await fs.promises.writeFile(cookiesFilePath, cookiesContent, {
      encoding: 'utf-8',
      flag: 'w',
    });
    return cookiesFilePath;
  } catch (e) {
    console.error('[ytdl/cookies] Failed to write cookies file:', e);
    return null;
  }
}

export async function buildCookieArgs(): Promise<string[]> {
  const cookiesFile = await getYouTubeCookiesFile();
  if (cookiesFile) {
    return ['--cookies', cookiesFile];
  }
  return [];
}