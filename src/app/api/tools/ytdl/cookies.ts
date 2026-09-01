import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * YouTube cookie management for yt-dlp fallback.
 * 
 * Note: The primary YouTube download engine no longer uses yt-dlp or cookies.
 * This module is only used as a last-resort fallback for:
 * 1. Non-YouTube URLs that need yt-dlp
 * 2. Edge cases where all API engines fail
 * 
 * Users can provide fresh cookies via environment variables if needed.
 */

let cookiesFilePath: string | null = null;

export async function getYouTubeCookiesFile(): Promise<string | null> {
  if (cookiesFilePath && fs.existsSync(cookiesFilePath)) {
    return cookiesFilePath;
  }

  let cookiesContent: string | null = null;

  // Priority 1: Environment variable (base64 encoded Netscape cookie file)
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

  // Priority 2: Plain text env var
  if (!cookiesContent && process.env.YOUTUBE_COOKIES) {
    cookiesContent = process.env.YOUTUBE_COOKIES;
  }

  // No embedded fallback cookies — they expire quickly and create a false
  // sense of security. Users should set YOUTUBE_COOKIES_BASE64 in Vercel
  // if they need yt-dlp cookie support. The primary download path uses
  // API engines that don't need cookies at all.

  if (!cookiesContent || cookiesContent.trim().length < 10) {
    return null;
  }

  // Clean UTF-8 BOM, normalize line endings
  cookiesContent = cookiesContent
    .replace(/^\uFEFF/, '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\r\n/g, '\n');

  cookiesFilePath = path.join(os.tmpdir(), 'yt-verified-cookies.txt');
  try {
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
    return [
      '--cookies', cookiesFile,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
      '--add-header', 'Sec-Fetch-Mode: navigate',
    ];
  }
  return [
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
    '--add-header', 'Sec-Fetch-Mode: navigate',
  ];
}
