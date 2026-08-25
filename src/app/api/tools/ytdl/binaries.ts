import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import zlib from 'zlib';
import ffmpegStatic from 'ffmpeg-static';

const YTDLP_LINUX_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
const FFMPEG_LINUX_GZ_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz';

const CACHE_STAMP = '20260825_v4';

function downloadFile(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download binary: HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(dest);
      });
    }).on('error', reject);
  });
}

function downloadAndGunzip(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadAndGunzip(res.headers.location!, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download FFmpeg: HTTP ${res.statusCode}`));
      }
      const gunzip = zlib.createGunzip();
      const out = fs.createWriteStream(dest);
      res.pipe(gunzip).pipe(out);
      out.on('finish', () => {
        out.close();
        resolve(dest);
      });
      gunzip.on('error', reject);
      out.on('error', reject);
    }).on('error', reject);
  });
}

let cachedYtdlpPath: string | null = null;
let cachedFfmpegPath: string | null = null;
let binaryInitPromise: Promise<{ ytdlpPath: string; ffmpegPath: string }> | null = null;

export async function ensureBinaries(): Promise<{ ytdlpPath: string; ffmpegPath: string }> {
  if (cachedYtdlpPath && cachedFfmpegPath && fs.existsSync(cachedYtdlpPath) && fs.existsSync(cachedFfmpegPath)) {
    return { ytdlpPath: cachedYtdlpPath, ffmpegPath: cachedFfmpegPath };
  }

  if (binaryInitPromise) return binaryInitPromise;

  binaryInitPromise = (async () => {
    const isWin = os.platform() === 'win32';
    const tmpDir = os.tmpdir();

    // 1. Prepare yt-dlp binary
    let ytdlpPath: string;
    if (isWin) {
      const localExe = path.join(tmpDir, 'yt-dlp-test.exe');
      if (fs.existsSync(localExe)) {
        ytdlpPath = localExe;
      } else {
        const winBinary = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
        ytdlpPath = fs.existsSync(winBinary) ? winBinary : 'yt-dlp';
      }
    } else {
      const tmpYtdlp = path.join(tmpDir, `yt-dlp-${CACHE_STAMP}`);
      if (!fs.existsSync(tmpYtdlp) || fs.statSync(tmpYtdlp).size < 1000000) {
        console.log('[ytdl/binaries] Downloading latest yt-dlp Linux binary...');
        await downloadFile(YTDLP_LINUX_URL, tmpYtdlp);
        fs.chmodSync(tmpYtdlp, '755');
      }
      ytdlpPath = tmpYtdlp;
    }

    // 2. Prepare FFmpeg binary
    let ffmpegPath: string;
    if (isWin) {
      ffmpegPath = (ffmpegStatic as string) || 'ffmpeg';
    } else {
      const tmpFfmpeg = path.join(tmpDir, 'ffmpeg_bin');
      if (!fs.existsSync(tmpFfmpeg) || fs.statSync(tmpFfmpeg).size < 10000000) {
        console.log('[ytdl/binaries] Downloading and decompressing Linux FFmpeg static binary...');
        await downloadAndGunzip(FFMPEG_LINUX_GZ_URL, tmpFfmpeg);
        fs.chmodSync(tmpFfmpeg, '755');
      }
      ffmpegPath = tmpFfmpeg;
    }

    cachedYtdlpPath = ytdlpPath;
    cachedFfmpegPath = ffmpegPath;
    return { ytdlpPath, ffmpegPath };
  })();

  return binaryInitPromise;
}

export async function ensureYtDlp(): Promise<string> {
  const { ytdlpPath } = await ensureBinaries();
  return ytdlpPath;
}

