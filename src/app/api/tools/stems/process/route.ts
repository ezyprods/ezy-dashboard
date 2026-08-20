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
    const clientToken = req.headers.get('x-replicate-token') || (formData.get('replicateToken') as string | null);
    const token = clientToken || process.env.REPLICATE_API_TOKEN;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo de audio' }, { status: 400 });
    }

    const taskId = uuidv4();
    const baseName = path.parse(file.name).name.replace(/[\\/:*?"<>|]/g, ' ').trim();
    
    // Si tenemos token de Replicate o no hay soporte de Python local, usamos la nube
    const useCloud = !!token && token.trim().length > 5;

    stemsTasks.set(taskId, {
      id: taskId,
      filename: file.name,
      status: 'pending',
      progress: 0,
      engine: useCloud ? 'cloud' : 'local'
    });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (useCloud) {
      // Iniciar procesamiento en la nube (GPU)
      processCloudReplicate(taskId, buffer, file.type || 'audio/mpeg', token!.trim()).catch(console.error);
    } else {
      // Iniciar procesamiento local en PC
      const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const inputPath = path.join(tempDir, `${taskId}_${file.name}`);
      await writeFile(inputPath, buffer);
      const outDir = path.join(tempDir, `Stems_${taskId}`);

      processDemucsLocal(taskId, inputPath, outDir, baseName).catch(console.error);
    }

    return NextResponse.json({ success: true, taskId, engine: useCloud ? 'cloud' : 'local' });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function processCloudReplicate(taskId: string, buffer: Buffer, mimeType: string, token: string) {
  const task = stemsTasks.get(taskId);
  if (!task) return;

  task.status = 'processing';
  task.progress = 10;
  broadcastStems(taskId, { type: 'update', task });

  try {
    const base64Data = buffer.toString('base64');
    const audioDataUri = `data:${mimeType || 'audio/mpeg'};base64,${base64Data}`;

    // Crear predicción en Replicate (Modelo HTDemucs)
    task.progress = 20;
    broadcastStems(taskId, { type: 'update', task });

    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // cjwbw/demucs official model version
        version: '25a17394d1220f60ed233e08c84778265cc96146d4df0095124ec6d6da84704b',
        input: {
          audio: audioDataUri,
          stem: 'all',
          model_name: 'htdemucs'
        }
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.detail || err.error || 'Error al iniciar la separación en Replicate');
    }

    const prediction = await createRes.json();
    const predictionId = prediction.id;

    // Polling del estado de la inferencia en GPU
    let isFinished = false;
    let pollCount = 0;

    while (!isFinished) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      pollCount++;

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!pollRes.ok) {
        throw new Error('Error al consultar el estado de la tarea en la nube');
      }

      const pollData = await pollRes.json();

      if (pollData.status === 'processing') {
        // Incremento visual de progreso suave
        task.progress = Math.min(25 + pollCount * 8, 92);
        broadcastStems(taskId, { type: 'update', task });
      } else if (pollData.status === 'succeeded') {
        isFinished = true;
        task.status = 'completed';
        task.progress = 100;

        const output = pollData.output || {};
        task.stems = {
          vocals: output.vocals || output['vocals.wav'],
          drums: output.drums || output['drums.wav'],
          bass: output.bass || output['bass.wav'],
          other: output.other || output['other.wav']
        };

        broadcastStems(taskId, { type: 'update', task });
      } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
        isFinished = true;
        throw new Error(pollData.error || 'La separación en la nube fue cancelada o falló');
      }
    }

  } catch (err: any) {
    console.error('Cloud Demucs Error:', err);
    task.status = 'error';
    task.error = err.message || 'Error desconocido durante la separación en la nube';
    broadcastStems(taskId, { type: 'update', task });
  }
}

async function processDemucsLocal(taskId: string, inputPath: string, outDir: string, baseName: string) {
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
