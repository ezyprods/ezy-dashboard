import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { stemsTasks, broadcastStems } from '../state';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const taskId = uuidv4();
    const baseName = path.parse(file.name).name.replace(/[\\/:*?"<>|]/g, ' ').trim();
    
    stemsTasks.set(taskId, {
      id: taskId,
      filename: file.name,
      status: 'pending',
      progress: 0
    });

    const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const inputPath = path.join(tempDir, `${taskId}_${file.name}`);
    await writeFile(inputPath, buffer);

    const outDir = path.join(tempDir, `Stems_${taskId}`);

    // Iniciar el proceso en background
    processDemucs(taskId, inputPath, outDir, baseName).catch(console.error);

    return NextResponse.json({ success: true, taskId });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function processDemucs(taskId: string, inputPath: string, outDir: string, baseName: string) {
  const task = stemsTasks.get(taskId);
  if (!task) return;

  task.status = 'processing';
  broadcastStems(taskId, { type: 'update', task });

  try {
    // python -m demucs.separate -n htdemucs "inputPath" -o "outDir"
    const args = ['-m', 'demucs.separate', '-n', 'htdemucs', inputPath, '-o', outDir];
    const demucsProc = spawn('python', args);

    let stderrLog = '';

    demucsProc.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress > task.progress) {
          task.progress = progress;
          broadcastStems(taskId, { type: 'update', task });
        }
      }
    });

    demucsProc.stderr.on('data', (data) => {
      const output = data.toString();
      stderrLog += output;
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress > task.progress) {
          task.progress = progress;
          broadcastStems(taskId, { type: 'update', task });
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      demucsProc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          console.error('Demucs Error Log:', stderrLog);
          const lines = stderrLog.split('\n').filter(l => l.trim().length > 0);
          const errorExtract = lines.length > 0 ? lines[lines.length - 1] : `exited with code ${code}`;
          reject(new Error(`Demucs process failed: ${errorExtract}`));
        }
      });
      demucsProc.on('error', reject);
    });

    // Clean temp
    await unlink(inputPath).catch(() => {});

    task.status = 'completed';
    task.progress = 100;
    // Demucs output structure: outDir / htdemucs / filename_without_ext / vocals.wav
    const finalDir = path.join(outDir, 'htdemucs', `${taskId}_${baseName}`);
    task.outputDir = finalDir; 

    broadcastStems(taskId, { type: 'update', task });

  } catch (err: any) {
    console.error('Demucs Error:', err);
    await unlink(inputPath).catch(() => {});
    task.status = 'error';
    task.error = err.message;
    broadcastStems(taskId, { type: 'update', task });
  }
}
