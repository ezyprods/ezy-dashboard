import os from 'os';
import fs from 'fs';
import https from 'https';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';

const YTDLP_URL = os.platform() === 'win32' 
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

export const downloadFile = (url: string, dest: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const tmpDest = `${dest}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const file = fs.createWriteStream(tmpDest);

    const cleanup = () => {
      file.destroy();
      fs.unlink(tmpDest, () => {});
    };

    const follow = (targetUrl: string, depth = 0) => {
      if (depth > 5) {
        cleanup();
        return reject(new Error('Too many redirects'));
      }

      const req = https.get(targetUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (!response.headers.location) {
            cleanup();
            return reject(new Error('Redirected without location header'));
          }
          follow(response.headers.location, depth + 1);
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
          reject(new Error(`Download failed with status code ${response.statusCode}`));
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

let binariesPromise: Promise<{ ytdlpPath: string; ffmpegPath: string }> | null = null;

export const ensureBinaries = async (): Promise<{ ytdlpPath: string; ffmpegPath: string }> => {
  if (binariesPromise) {
    return binariesPromise;
  }

  binariesPromise = (async () => {
    const tmpDir = os.tmpdir();
    const isWin = os.platform() === 'win32';
    const ytdlpPath = path.join(tmpDir, isWin ? 'yt-dlp-2026.exe' : 'yt-dlp-2026');
    const ffmpegPath = ffmpegStatic || 'ffmpeg';

    // Verify yt-dlp binary exists and is valid (> 5MB)
    let ytdlpValid = false;
    if (fs.existsSync(ytdlpPath)) {
      try {
        const stat = fs.statSync(ytdlpPath);
        if (stat.size > 5000000) {
          ytdlpValid = true;
        } else {
          fs.unlinkSync(ytdlpPath);
        }
      } catch (e) {
        ytdlpValid = false;
      }
    }

    if (!ytdlpValid) {
      console.log('Downloading yt-dlp binary...');
      await downloadFile(YTDLP_URL, ytdlpPath);
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
