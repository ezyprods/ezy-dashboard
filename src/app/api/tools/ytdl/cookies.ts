import fs from 'fs';
import path from 'path';
import os from 'os';

let cookiesFilePath: string | null = null;
let cookiesFileWritten = false;

export async function getYouTubeCookiesFile(): Promise<string | null> {
  if (cookiesFileWritten && cookiesFilePath && fs.existsSync(cookiesFilePath)) {
    return cookiesFilePath;
  }

  let cookiesContent: string | null = null;

  if (process.env.YOUTUBE_COOKIES_BASE64) {
    try {
      cookiesContent = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf-8');
    } catch (e) {
      console.warn('[cookies] Error decoding YOUTUBE_COOKIES_BASE64:', e);
    }
  }

  if (!cookiesContent && process.env.YOUTUBE_COOKIES) {
    cookiesContent = process.env.YOUTUBE_COOKIES;
  }

  if (!cookiesContent || cookiesContent.trim().length < 10) {
    return null;
  }

  if (!cookiesContent.includes('# Netscape HTTP Cookie File') && !cookiesContent.includes('.youtube.com')) {
    console.warn('[cookies] Env var does not look like a Netscape cookie file');
    return null;
  }

  cookiesFilePath = path.join(os.tmpdir(), 'yt-cookies.txt');
  try {
    await fs.promises.writeFile(cookiesFilePath, cookiesContent, 'utf-8');
    cookiesFileWritten = true;
    console.log('[cookies] YouTube cookies written to temp file');
    return cookiesFilePath;
  } catch (e) {
    console.error('[cookies] Error writing cookies file:', e);
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