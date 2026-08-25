import os from 'os';
import fs from 'fs';
import https from 'https';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MIN_YTDLP_VERSION = '2026.08.01';
const YTDLP_CACHE_KEY = '20260825_v2';
const YTDLP_URL =
  os.platform() === 'win32'
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

export const downloadFile = (url: string, dest: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const tmpDest = `${dest}.tmp.${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 7)}`;
    const file = fs.createWriteStream(tmpDest);

    const cleanup = () => {
      file.destroy();
      fs.unlink(tmpDest, () => {});
    };

    const follow = (targetUrl: string, depth = 0) => {
      if (depth > 10) {
        cleanup();
        return reject(new Error('Too many redirects'));
      }

      const req = https.get(targetUrl, (response) => {
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 303 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          if (!response.headers.location) {
            cleanup();
            return reject(new Error('Redirected without location header'));
          }
          let location = response.headers.location;
          if (location.startsWith('/')) {
            const parsed = new URL(targetUrl);
            location = `${parsed.protocol}//${parsed.host}${location}`;
          }
          response.resume();
          follow(location, depth + 1);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close((err) => {
              if (err) {
                cleanup();
                return reject(err);
              }
              try {
                if (os.platform() !== 'win32') {
                  fs.chmodSync(tmpDest, '755');
                }
                fs.renameSync(tmpDest, dest);
                resolve();
              } catch (renameErr) {
                cleanup();
                reject(renameErr);
              }
            });
          });
        } else {
          cleanup();
          reject(
            new Error(
              `Download failed with status code ${response.statusCode} for ${targetUrl}`
            )
          );
        }
      });

      req.on('error', (err) => {
        cleanup();
        reject(err);
      });
    };

    follow(url);
  });
};

async function getYtDlpVersion(ytdlpPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(ytdlpPath, ['--version'], {
      timeout: 10000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

function isVersionSufficient(version: string, minVersion: string): boolean {
  return version.replace(/\./g, '') >= minVersion.replace(/\./g, '');
}

let binariesPromise: Promise<{ ytdlpPath: string; ffmpegPath: string }> | null =
  null;

export const ensureBinaries = async (): Promise<{
  ytdlpPath: string;
  ffmpegPath: string;
}> => {
  if (binariesPromise) {
    return binariesPromise;
  }

  binariesPromise = (async () => {
    const tmpDir = os.tmpdir();
    const isWin = os.platform() === 'win32';
    
    // 1. Prepare yt-dlp binary
    const ytdlpPath = path.join(
      tmpDir,
      isWin ? `yt-dlp-${YTDLP_CACHE_KEY}.exe` : `yt-dlp-${YTDLP_CACHE_KEY}`
    );

    let ytdlpValid = false;

    if (fs.existsSync(ytdlpPath)) {
      try {
        const stat = fs.statSync(ytdlpPath);
        if (stat.size > 5_000_000) {
          const version = await getYtDlpVersion(ytdlpPath);
          if (version && isVersionSufficient(version, MIN_YTDLP_VERSION)) {
            ytdlpValid = true;
          } else {
            fs.unlinkSync(ytdlpPath);
          }
        } else {
          fs.unlinkSync(ytdlpPath);
        }
      } catch (e) {
        ytdlpValid = false;
      }
    }

    if (!ytdlpValid) {
      console.log('[ytdl/binaries] Downloading fresh yt-dlp binary...');
      await downloadFile(YTDLP_URL, ytdlpPath);
      if (!isWin) {
        try { fs.chmodSync(ytdlpPath, '755'); } catch (e) {}
      }
    }

    // 2. Prepare FFmpeg binary (ensure executable in Linux /tmp)
    let ffmpegPath = (ffmpegStatic as string) || 'ffmpeg';
    
    if (!isWin && ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      const tmpFfmpeg = path.join(tmpDir, 'ffmpeg_bin');
      try {
        if (!fs.existsSync(tmpFfmpeg)) {
          fs.copyFileSync(ffmpegStatic, tmpFfmpeg);
          fs.chmodSync(tmpFfmpeg, '755');
        }
        ffmpegPath = tmpFfmpeg;
      } catch (e) {
        console.warn('[ytdl/binaries] Could not copy ffmpeg to /tmp, using default path:', e);
      }
    }

    return { ytdlpPath, ffmpegPath };
  })().catch((err) => {
    binariesPromise = null;
    throw err;
  });

  return binariesPromise;
};

export const ensureYtDlp = async (): Promise<string> => {
  const { ytdlpPath } = await ensureBinaries();
  return ytdlpPath;
};
