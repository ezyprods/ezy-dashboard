import os from 'os';
import fs from 'fs';
import https from 'https';

const YTDLP_URL = os.platform() === 'win32' 
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

const FFMPEG_URL = os.platform() === 'win32'
  ? 'https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/win32-x64'
  : 'https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/linux-x64';

export const downloadFile = (url: string, dest: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const follow = (targetUrl: string, depth = 0) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      https.get(targetUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          follow(response.headers.location!, depth + 1);
        } else {
          response.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }
      }).on('error', (err) => { fs.unlink(dest, () => reject(err)); });
    };
    follow(url);
  });
};

export const ensureBinaries = async () => {
  const tmpDir = os.tmpdir();
  const isWin = os.platform() === 'win32';
  const ytdlpPath = `${tmpDir}/${isWin ? 'yt-dlp-new.exe' : 'yt-dlp-new'}`;
  const ffmpegPath = `${tmpDir}/${isWin ? 'ffmpeg-new.exe' : 'ffmpeg-new'}`;

  if (!fs.existsSync(ytdlpPath)) {
    console.log('Downloading yt-dlp...');
    await downloadFile(YTDLP_URL, ytdlpPath);
    if (!isWin) fs.chmodSync(ytdlpPath, '755');
  }

  if (!fs.existsSync(ffmpegPath)) {
    console.log('Downloading ffmpeg...');
    await downloadFile(FFMPEG_URL, ffmpegPath);
    if (!isWin) fs.chmodSync(ffmpegPath, '755');
  }

  return { ytdlpPath, ffmpegPath };
};
