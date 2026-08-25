import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ensureBinaries } from '../binaries';
import { getYouTubeCookiesFile } from '../cookies';

const execFileAsync = promisify(execFile);
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { ytdlpPath } = await ensureBinaries();
    const cookiesFile = await getYouTubeCookiesFile();

    const videoUrl = 'https://www.youtube.com/watch?v=-70XoLLLR-o';

    const clientConfigs = [
      { name: 'mediaconnect_no_cookies', args: ['--extractor-args', 'youtube:player_client=mediaconnect'] },
      { name: 'ios_no_cookies', args: ['--extractor-args', 'youtube:player_client=ios'] },
      { name: 'android_no_cookies', args: ['--extractor-args', 'youtube:player_client=android'] },
      { name: 'android_music_no_cookies', args: ['--extractor-args', 'youtube:player_client=android_music'] },
      { name: 'tv_embedded_no_cookies', args: ['--extractor-args', 'youtube:player_client=tv_embedded'] },
      { name: 'web_creator_no_cookies', args: ['--extractor-args', 'youtube:player_client=web_creator'] },
      { name: 'mweb_no_cookies', args: ['--extractor-args', 'youtube:player_client=mweb'] },
      { name: 'mediaconnect_with_cookies', args: ['--cookies', cookiesFile!, '--extractor-args', 'youtube:player_client=mediaconnect'] },
      { name: 'tv_embedded_with_cookies', args: ['--cookies', cookiesFile!, '--extractor-args', 'youtube:player_client=tv_embedded'] },
      { name: 'default_no_cookies', args: [] },
    ];

    const results: any = {};

    for (const conf of clientConfigs) {
      try {
        const cmdArgs = ['--no-warnings', '--no-playlist', ...conf.args, '--dump-json', videoUrl];
        const res = await execFileAsync(ytdlpPath, cmdArgs, { timeout: 8000 });
        const json = JSON.parse(res.stdout);
        results[conf.name] = {
          success: true,
          title: json.title,
          formatsCount: json.formats?.length
        };
        // If we found one that works, we can stop early or test all
      } catch (e: any) {
        results[conf.name] = {
          success: false,
          error: (e.stderr || e.message || '').slice(0, 150)
        };
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
