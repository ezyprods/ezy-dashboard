import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs, getYouTubeCookiesFile } from '../cookies';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();
    const cookiesFile = await getYouTubeCookiesFile();
    const cookiesExist = cookiesFile ? fs.existsSync(cookiesFile) : false;
    const cookiesSize = cookiesExist ? fs.statSync(cookiesFile!).size : 0;

    let testRun: any = {};
    try {
      const res = await execFileAsync(ytdlpPath, [
        '--no-warnings',
        '--no-playlist',
        ...cookieArgs,
        '--dump-json',
        'https://www.youtube.com/watch?v=-70XoLLLR-o'
      ], { timeout: 30000 });
      const json = JSON.parse(res.stdout);
      testRun = {
        success: true,
        title: json.title,
        uploader: json.uploader,
        formatsCount: json.formats?.length
      };
    } catch (e: any) {
      testRun = {
        success: false,
        error: e.message,
        stderr: e.stderr,
        stdout: e.stdout
      };
    }

    return NextResponse.json({
      platform: os.platform(),
      arch: os.arch(),
      ytdlpPath,
      ytdlpExists: fs.existsSync(ytdlpPath),
      ffmpegPath,
      ffmpegExists: fs.existsSync(ffmpegPath),
      cookiesFile,
      cookiesExist,
      cookiesSize,
      testRun
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
